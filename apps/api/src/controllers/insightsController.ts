import { Request, Response } from "express";
import { insightsQuerySchema } from "../schemas/insightsSchema";
import * as reply from "../utils/response";
import Category from "../models/Category";
import Transaction from "../models/Transaction";
import mongoose from "mongoose";
import Account from "../models/Account";
import {
    addDaysInZone,
    addMonthsInZone,
    addYearsInZone,
    dayKeyInZone,
    monthLabelInZone,
    startOfDayInZone,
    startOfMonthInZone,
    startOfWeekInZone,
    startOfYearInZone,
} from "../utils/timezone";
import { resolveZone } from "../utils/userZone";

// GET /insights?period=week|month|year
//
// Every window, bucket and day count below is cut in the user's zone. UTC buckets under
// locally-grouped rows put a spend on one bar and under a different heading, and the sum of
// the bars stops matching the total above them.

export const getInsights = async (req: Request, res: Response): Promise<void> => {

    const { period, offset } = insightsQuerySchema.parse(req.query);
    const zone = await resolveZone(req);

    const { currentStartDate, currentEndDate, previousStartDate, previousEndDate } = parsePeriod(period, offset, zone);

    const trend = await getTrend(currentStartDate, currentEndDate, period, zone, req);
    const incomeVsExpense = await getIncomeVsExpense(currentStartDate, currentEndDate, period, zone, req);
    const byCategory = await getCategoryBreakDown(currentStartDate, currentEndDate, req);
    const byAccount = await getAccountBreakDown(currentStartDate, currentEndDate, req);
    const avgDailySpendCurrent = await getAverageSpend(currentStartDate, currentEndDate, zone, req);
    const avgDailySpendPrevious = await getAverageSpend(previousStartDate, previousEndDate, zone, req);
    const topCategory = await getTopCategory(byCategory);
    const txnCount = await Transaction.countDocuments({
        userId: req.user?.userId,
        type: { $in: ["expense", "income"] },
        occurredAt: { $gte: currentStartDate, $lt: currentEndDate }
    })

    reply.ok(res, { period, timeZone: zone, periodStart: currentStartDate, periodEnd: currentEndDate, trend, incomeVsExpense, byCategory, byAccount, avgDailySpendCurrent, avgDailySpendPrevious, topCategory, txnCount }, "Insights fetched successfully");
}

type periodType = {
    currentStartDate: Date,
    currentEndDate: Date,
    previousStartDate: Date,
    previousEndDate: Date
}

// `offset` slides the window back by that many periods (0 = current, -1 = previous, …),
// always anchored on the unit containing "now" so switching period type re-anchors.
//
// Stepped with the zone-aware helpers, not by adding milliseconds: a month is 28–31 days,
// and across a DST change a week is not 168 hours.
const parsePeriod = (period: string, offset: number, zone: string): periodType => {

    const now = new Date();

    if (period === "year") {
        const currentStartDate = addYearsInZone(startOfYearInZone(now, zone), zone, offset);
        const currentEndDate = addYearsInZone(currentStartDate, zone, 1);
        return {
            currentStartDate,
            currentEndDate,
            previousStartDate: addYearsInZone(currentStartDate, zone, -1),
            previousEndDate: currentStartDate
        }
    }
    if (period === "month") {
        const currentStartDate = addMonthsInZone(startOfMonthInZone(now, zone), zone, offset);
        const currentEndDate = addMonthsInZone(currentStartDate, zone, 1);
        return {
            currentStartDate,
            currentEndDate,
            previousStartDate: addMonthsInZone(currentStartDate, zone, -1),
            previousEndDate: currentStartDate
        }
    }
    else {
        const currentStartDate = addDaysInZone(startOfWeekInZone(now, zone), zone, offset * 7);
        const currentEndDate = addDaysInZone(currentStartDate, zone, 7);
        return {
            currentStartDate,
            currentEndDate,
            previousStartDate: addDaysInZone(currentStartDate, zone, -7),
            previousEndDate: currentStartDate
        }
    }
}

const getCategoryBreakDown = async (startTime: Date, endTime: Date, req: Request) => {
    const categories = await Category.find({
        userId: req.user?.userId
    })
        .select("_id name parent")
        .lean();


    const categorySpend = await Transaction.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(req.user!.userId),
                type: "expense",
                occurredAt: { $gte: startTime, $lt: endTime }
            }
        },
        {
            $group: {
                _id: "$category",
                total: { $sum: "$amount" }
            }
        }
    ]);
    const hash = new Map<string, number>();

    for (const category of categorySpend) {
        if (!category._id) continue;

        const parent = categories.find((c) => c._id.toString() === category._id.toString())?.parent;

        const key = parent ? parent.toString() : category._id.toString();

        hash.set(key, (hash.get(key) ?? 0) + category.total);
    }

    const result = [];
    for (const [id, val] of hash) {
        const name = categories.find((c) => c._id.toString() === id)?.name;
        result.push({
            categoryId: id,
            name,
            total: val
        });
    }

    result.sort((a, b) => b.total - a.total);

    return result;
}

const getAccountBreakDown = async (startTime: Date, endTime: Date, req: Request) => {
    const accountSpend = await Transaction.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(req.user!.userId),
                type: "expense",
                occurredAt: { $gte: startTime, $lt: endTime }
            }
        },
        {
            $group: {
                _id: "$account",
                total: { $sum: "$amount" }
            }
        },
        {
            $sort: {
                total: -1
            }
        }
    ]);

    const accounts = await Account.find({
        userId: req.user?.userId
    }).select("_id name").lean();

    const result = [];

    for (const account of accountSpend) {
        const name = accounts.find((a) => a._id.toString() === account._id.toString())?.name;
        result.push({
            accountId: account._id.toString(),
            name,
            total: account.total
        })
    }

    return result;
}

// Whole calendar days between two instants. Both ends floored to local midnight first, so
// this counts date boundaries crossed rather than 24-hour spans — what "average per day"
// means to a person. `Math.round` absorbs the 23- and 25-hour DST days.
const daysBetweenInZone = (from: Date, to: Date, zone: string): number => {
    const a = startOfDayInZone(from, zone).getTime();
    const b = startOfDayInZone(to, zone).getTime();
    return Math.round((b - a) / 86_400_000);
}

const getAverageSpend = async (startTime: Date, endTime: Date, zone: string, req: Request) => {
    const totalSpend = await Transaction.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(req.user!.userId),
                type: "expense",
                occurredAt: { $gte: startTime, $lt: endTime }
            }
        },
        {
            $group: {
                _id: null,
                total: { $sum: "$amount" }
            }
        },
    ]);

    // Current (partial) period → divide by days elapsed incl. today; a completed
    // period → its full length.
    const now = new Date();
    const numberOfDays = endTime > now
        ? daysBetweenInZone(startTime, now, zone) + 1
        : daysBetweenInZone(startTime, endTime, zone);

    const total = totalSpend[0]?.total ?? 0;

    return Math.round(total / Math.max(1, numberOfDays));
}

const getTopCategory = (byCategory: { name?: string; total: number }[]) => {
    let topCategory = null, maxValue = 0;

    for (const category of byCategory) {
        if (category.name === "Others") {
            continue;
        }
        if (category.total > maxValue) {
            topCategory = category.name;
            maxValue = category.total;
        }
    }

    return topCategory;
}

const getIncomeVsExpense = async (startTime: Date, endTime: Date, period: string, zone: string, req: Request) => {

    // The 6 unit-starts, oldest -> newest (newest = the current period start).
    const buckets: Date[] = [];
    for (let i = 5; i >= 0; i--) {
        if (period === "year") buckets.push(addYearsInZone(startTime, zone, -i));
        else if (period === "month") buckets.push(addMonthsInZone(startTime, zone, -i));
        else buckets.push(addDaysInZone(startTime, zone, -i * 7));
    }

    const unit = period === "year" ? "year" : period === "month" ? "month" : "week";
    // `timezone` is what makes Mongo cut the unit where the user lives; without it the
    // server's buckets and the client's labels drift by the offset — near a month
    // boundary, by a whole unit.
    const truncSpec: Record<string, unknown> = { date: "$occurredAt", unit, timezone: zone };
    if (unit === "week") truncSpec.startOfWeek = "monday";

    const rows = await Transaction.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(req.user!.userId),
                type: { $in: ["expense", "income"] },
                occurredAt: { $gte: buckets[0], $lt: endTime }
            }
        },
        {
            $group: {
                _id: { $dateTrunc: truncSpec },
                income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } },
                expense: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } }
            }
        }
    ]);

    // Matched on the bucket's zone-local date, not its instant: only one side went through
    // BSON, so comparing day keys is immune to a millisecond of rounding.
    const byStart = new Map<string, { income: number; expense: number }>();
    for (const row of rows) {
        byStart.set(dayKeyInZone(new Date(row._id), zone), { income: row.income, expense: row.expense });
    }

    // Zero-fill so the client always gets exactly 6 units in order.
    return buckets.map((start) => {
        const key = dayKeyInZone(start, zone);
        const hit = byStart.get(key);
        return { periodStart: key, income: hit?.income ?? 0, expense: hit?.expense ?? 0 };
    });
}

/**
 * The expense trend: one bucket per day (week/month) or per month (year), dense and in
 * order, zeros included. Zero-filled here because only the server knows which zone the
 * buckets were cut in, leaving the client a plain map over an array it can trust.
 */
const getTrend = async (startTime: Date, endTime: Date, period: string, zone: string, req: Request) => {
    const monthly = period === "year";

    const rows = await Transaction.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(req.user!.userId),
                type: "expense",
                occurredAt: { $gte: startTime, $lt: endTime }
            }
        },
        {
            $group: {
                // Grouped straight into the calendar key the client reads, so no instant
                // is re-interpreted downstream.
                _id: {
                    $dateToString: {
                        date: "$occurredAt",
                        format: monthly ? "%Y-%m" : "%Y-%m-%d",
                        timezone: zone
                    }
                },
                total: { $sum: "$amount" }
            }
        }
    ]);

    const byKey = new Map<string, number>(rows.map((row) => [row._id as string, row.total as number]));

    // An unfinished window stops after today: the chart should show the month so far, not
    // a cliff at the current date followed by a flat line to the 31st.
    const now = new Date();
    const cap = monthly
        ? addMonthsInZone(startOfMonthInZone(now, zone), zone, 1)
        : addDaysInZone(startOfDayInZone(now, zone), zone, 1);
    const stop = endTime < cap ? endTime : cap;

    const out: { date: string; amount: number }[] = [];
    let cursor = startTime;
    while (cursor < stop) {
        const key = monthly ? monthLabelInZone(cursor, zone) : dayKeyInZone(cursor, zone);
        out.push({ date: key, amount: byKey.get(key) ?? 0 });
        cursor = monthly ? addMonthsInZone(cursor, zone, 1) : addDaysInZone(cursor, zone, 1);
    }

    return out;
}
