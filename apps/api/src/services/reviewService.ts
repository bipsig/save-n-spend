import { Request } from "express";
import mongoose from "mongoose";
import Account from "../models/Account";
import Bill from "../models/Bill";
import Goal from "../models/Goal";
import GoalContributionLog from "../models/GoalContributionLog";
import Transaction from "../models/Transaction";
import { parsePeriod, getCategoryBreakDown } from "../controllers/insightsController";
import { buildTimeline } from "./reviewTimelineService";
import { netWorthAtBoundaries } from "./netWorthHistoryService";
import { daysLate } from "./billService";
import { noSpendDays } from "./reviewMath";
import { currentStreak, STREAK_LOOKBACK_DAYS } from "./streakMath";
import { wholeDays } from "./highlightSnapshotMath";
import { addDaysInZone, partsInZone } from "../utils/timezone";
import { formatAmount } from "../utils/money";
import type { ReviewPayload } from "@save-n-spend/types";

const FLOW_TYPES = ["income", "expense"];

const flowTotals = async (oid: mongoose.Types.ObjectId, start: Date, end: Date) => {
    const rows = await Transaction.aggregate<{ _id: string; total: number }>([
        { $match: { userId: oid, type: { $in: FLOW_TYPES }, occurredAt: { $gte: start, $lt: end } } },
        { $group: { _id: "$type", total: { $sum: "$amount" } } },
    ]);
    const income = rows.find((r) => r._id === "income")?.total ?? 0;
    const expense = rows.find((r) => r._id === "expense")?.total ?? 0;
    return { income, expense };
};

/** Consecutive zone-local days with at least one logged transaction, ending at the LAST
 *  day of the reviewed period — not "today". Deliberately doesn't reuse
 *  highlightSnapshotService's `computeCurrentStreak`: that function's query has no upper
 *  bound on `occurredAt` (fine when `now` really is today; wrong here, where it would pull
 *  in every day AFTER the reviewed period too). */
const streakAsOf = async (oid: mongoose.Types.ObjectId, zone: string, periodEnd: Date): Promise<number> => {
    const since = addDaysInZone(periodEnd, zone, -STREAK_LOOKBACK_DAYS);
    const dayRows = await Transaction.aggregate<{ _id: string }>([
        {
            $match: {
                userId: oid,
                type: { $nin: ["positiveAdjustment", "negativeAdjustment"] },
                occurredAt: { $gte: since, $lt: periodEnd },
            },
        },
        { $group: { _id: { $dateToString: { date: "$occurredAt", format: "%Y-%m-%d", timezone: zone } } } },
    ]);
    return currentStreak(new Set(dayRows.map((r) => r._id)), new Date(periodEnd.getTime() - 1), zone);
};

const activeDayCount = async (oid: mongoose.Types.ObjectId, zone: string, start: Date, end: Date): Promise<number> => {
    const rows = await Transaction.aggregate<{ _id: string }>([
        {
            $match: {
                userId: oid,
                type: { $nin: ["positiveAdjustment", "negativeAdjustment"] },
                occurredAt: { $gte: start, $lt: end },
            },
        },
        { $group: { _id: { $dateToString: { date: "$occurredAt", format: "%Y-%m-%d", timezone: zone } } } },
    ]);
    return rows.length;
};

const weekLabel = (start: Date, end: Date, zone: string): string => {
    const lastDay = new Date(end.getTime() - 1);
    const startParts = partsInZone(start, zone);
    const endParts = partsInZone(lastDay, zone);
    const startFmt = new Intl.DateTimeFormat("en-IN", { month: "short", day: "numeric", timeZone: zone }).format(start);
    if (startParts.month === endParts.month && startParts.year === endParts.year) {
        return `${startFmt} – ${endParts.day}`;
    }
    const endFmt = new Intl.DateTimeFormat("en-IN", { month: "short", day: "numeric", timeZone: zone }).format(lastDay);
    return `${startFmt} – ${endFmt}`;
};

const composeVerdict = (saved: number, previousSaved: number, currency: string) => {
    const headline = `${formatAmount(saved, currency)} saved this period`;
    if (previousSaved === 0) {
        return { headline, detail: "No prior period with any saving to compare against yet." };
    }
    const deltaPct = Math.round(((saved - previousSaved) / Math.abs(previousSaved)) * 100);
    const detail = deltaPct === 0
        ? "About the same as last time."
        : deltaPct > 0
            ? `Up ${deltaPct}% from last time.`
            : `Down ${Math.abs(deltaPct)}% from last time.`;
    return { headline, detail };
};

export const buildReview = async (
    userId: string,
    zone: string,
    currency: string,
    period: "week" | "month",
    offset: number,
    req: Request,
): Promise<ReviewPayload> => {
    const oid = new mongoose.Types.ObjectId(userId);
    const { currentStartDate: start, currentEndDate: end, previousStartDate, previousEndDate } = parsePeriod(period, offset, zone);

    const [current, previous, categorySlices, biggestExpenseRows, firstTxn, accountsTotal, activeDays, streakAtEnd] = await Promise.all([
        flowTotals(oid, start, end),
        flowTotals(oid, previousStartDate, previousEndDate),
        getCategoryBreakDown(start, end, req),
        Transaction.aggregate([
            { $match: { userId: oid, type: "expense", occurredAt: { $gte: start, $lt: end } } },
            { $sort: { amount: -1 } },
            { $limit: 1 },
            { $project: { title: 1, amount: 1, occurredAt: 1 } },
        ]),
        Transaction.findOne({ userId: oid }).sort({ occurredAt: 1 }).select("occurredAt").lean(),
        Account.aggregate([{ $match: { userId: oid, isArchived: false } }, { $group: { _id: null, total: { $sum: "$balance" } } }]),
        activeDayCount(oid, zone, start, end),
        streakAsOf(oid, zone, end),
    ]);

    const income = current.income;
    const expenses = current.expense;
    const saved = income - expenses;

    const totalCategorySpend = categorySlices.reduce((sum, c) => sum + c.total, 0);
    const categories = categorySlices.slice(0, 5).map((c) => ({
        categoryId: c.categoryId,
        name: c.name,
        total: c.total,
        pct: totalCategorySpend > 0 ? Math.round((c.total / totalCategorySpend) * 100) : 0,
    }));

    const biggestExpense = biggestExpenseRows[0]
        ? { title: biggestExpenseRows[0].title as string, amount: biggestExpenseRows[0].amount as number, occurredAt: new Date(biggestExpenseRows[0].occurredAt).toISOString() }
        : null;

    const totalDays = wholeDays(start, end, zone);

    // Net worth only for a month, and only as far back as the account's own history
    // reaches — see netWorthAtBoundaries. A week barely moves it and has no weekly
    // reconstruction to draw on.
    let netWorth: ReviewPayload["netWorth"] = null;
    if (period === "month") {
        const currentNetWorth = accountsTotal[0]?.total ?? 0;
        if (firstTxn) {
            const [previousTotal, total] = await netWorthAtBoundaries(oid, zone, currentNetWorth, firstTxn.occurredAt, [start, end]);
            if (previousTotal !== null && total !== null) {
                netWorth = { total, previousTotal };
            }
        }
    }

    const [contributionRows, paidBills, dueBills] = await Promise.all([
        GoalContributionLog.aggregate<{ _id: mongoose.Types.ObjectId; total: number }>([
            { $match: { userId: oid, createdAt: { $gte: start, $lt: end } } },
            { $group: { _id: "$goalId", total: { $sum: "$amount" } } },
        ]),
        Bill.find({ userId: oid, lastPaidAt: { $gte: start, $lt: end } }).select("name dueDate lastPaidAt recurring").lean(),
        Bill.find({ userId: oid, recurring: { $ne: true }, dueDate: { $gte: start, $lt: end } }).countDocuments(),
    ]);

    const goalNames = contributionRows.length > 0
        ? new Map((await Goal.find({ _id: { $in: contributionRows.map((r) => r._id) } }).select("name").lean())
            .map((g) => [String(g._id), g.name]))
        : new Map<string, string>();

    const goals = contributionRows
        .map((r) => ({ goalId: String(r._id), name: goalNames.get(String(r._id)) ?? "Goal", contributed: r.total }))
        .sort((a, b) => b.contributed - a.contributed);

    const late = paidBills
        .filter((b) => !b.recurring && b.lastPaidAt && daysLate(b.dueDate, b.lastPaidAt, zone) > 0)
        .map((b) => ({ name: b.name, daysLate: daysLate(b.dueDate, b.lastPaidAt as Date, zone) }));

    // Investments this period — contributed (transfers in), portfolio change (net of the
    // value-updates), and the holding that gained most. Null when there are no investments.
    const investmentAccounts = await Account.find({ userId: oid, type: "investment", isArchived: false }).select("name").lean();
    let investments: ReviewPayload["investments"] = null;
    if (investmentAccounts.length > 0) {
        const invIds = investmentAccounts.map((a) => a._id);
        const nameById = new Map(investmentAccounts.map((a) => [String(a._id), a.name]));
        const [contribRows, adjRows] = await Promise.all([
            Transaction.aggregate<{ _id: null; total: number }>([
                { $match: { userId: oid, type: "transfer", toAccount: { $in: invIds }, occurredAt: { $gte: start, $lt: end } } },
                { $group: { _id: null, total: { $sum: "$amount" } } },
            ]),
            Transaction.aggregate<{ _id: mongoose.Types.ObjectId; total: number }>([
                { $match: { userId: oid, type: { $in: ["positiveAdjustment", "negativeAdjustment"] }, account: { $in: invIds }, occurredAt: { $gte: start, $lt: end } } },
                { $group: { _id: "$account", total: { $sum: { $cond: [{ $eq: ["$type", "positiveAdjustment"] }, "$amount", { $multiply: ["$amount", -1] }] } } } },
            ]),
        ]);
        const gainer = adjRows.filter((r) => r.total > 0).sort((a, b) => b.total - a.total)[0];
        investments = {
            contributed: contribRows[0]?.total ?? 0,
            portfolioChange: adjRows.reduce((s, r) => s + r.total, 0),
            biggestGainer: gainer ? { name: nameById.get(String(gainer._id)) ?? "Investment", amount: gainer.total } : null,
        };
    }

    const timeline = await buildTimeline(userId, zone, currency, period, start, end, saved, req);

    return {
        period,
        offset,
        periodLabel: period === "month"
            ? new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: zone }).format(start)
            : weekLabel(start, end, zone),
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        verdict: composeVerdict(saved, previous.income - previous.expense, currency),
        income,
        expenses,
        saved,
        previousIncome: previous.income,
        previousExpenses: previous.expense,
        previousSaved: previous.income - previous.expense,
        categories,
        biggestExpense,
        timeline,
        habits: { streakAtEnd, activeDays, totalDays, noSpendDays: noSpendDays(totalDays, activeDays) },
        netWorth,
        goals,
        bills: { paidCount: paidBills.length, dueCount: dueBills, late },
        investments,
    };
};
