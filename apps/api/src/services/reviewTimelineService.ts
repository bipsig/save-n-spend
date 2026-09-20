import { Request } from "express";
import mongoose from "mongoose";
import Transaction from "../models/Transaction";
import Bill from "../models/Bill";
import Goal from "../models/Goal";
import GoalContributionLog from "../models/GoalContributionLog";
import HighlightLog from "../models/HighlightLog";
import { daysLate } from "./billService";
import { bestWorstWeek } from "./reviewMath";
import { getTrend } from "../controllers/insightsController";
import { formatAmount } from "../utils/money";
import type { ReviewMoment } from "@save-n-spend/types";

// Assembles whatever of these is real for the period into a dated, sorted list — some
// periods will have only two or three moments, which is expected: this only ever reports
// what actually happened, never pads a quiet period out to look eventful.

const HIGHLIGHT_LIMIT = 5;
const SEVERITY_KIND: Record<string, ReviewMoment["kind"]> = {
    urgent: "warn",
    warning: "warn",
    win: "win",
    notice: "neutral",
};

export const buildTimeline = async (
    userId: string,
    zone: string,
    currency: string,
    period: "week" | "month",
    start: Date,
    end: Date,
    saved: number,
    req: Request,
): Promise<ReviewMoment[]> => {
    const oid = new mongoose.Types.ObjectId(userId);
    const moments: ReviewMoment[] = [];

    const [biggestExpense, highlightRows, lateBills, contributions] = await Promise.all([
        Transaction.aggregate([
            { $match: { userId: oid, type: "expense", occurredAt: { $gte: start, $lt: end } } },
            { $sort: { amount: -1 } },
            { $limit: 1 },
            { $project: { title: 1, amount: 1, occurredAt: 1 } },
        ]),
        HighlightLog.find({ userId: oid, createdAt: { $gte: start, $lt: end } })
            .sort({ materiality: -1 })
            .limit(HIGHLIGHT_LIMIT)
            .select("title severity createdAt")
            .lean(),
        Bill.find({ userId: oid, recurring: { $ne: true }, lastPaidAt: { $gte: start, $lt: end } })
            .select("name dueDate lastPaidAt")
            .lean(),
        GoalContributionLog.find({ userId: oid, createdAt: { $gte: start, $lt: end } })
            .sort({ amount: -1 })
            .limit(1)
            .lean(),
    ]);

    if (biggestExpense[0]) {
        const { title, amount, occurredAt } = biggestExpense[0];
        moments.push({
            date: new Date(occurredAt).toISOString(),
            kind: "neutral",
            text: `Biggest expense of the period: ${title ?? "an expense"}, ${formatAmount(amount, currency)}`,
        });
    }

    for (const row of highlightRows) {
        moments.push({
            date: new Date(row.createdAt).toISOString(),
            kind: SEVERITY_KIND[row.severity] ?? "neutral",
            text: row.title,
        });
    }

    for (const bill of lateBills) {
        if (!bill.lastPaidAt) continue;
        const late = daysLate(bill.dueDate, bill.lastPaidAt, zone);
        if (late <= 0) continue;
        moments.push({
            date: new Date(bill.lastPaidAt).toISOString(),
            kind: "warn",
            text: `${bill.name} was paid ${late} day${late === 1 ? "" : "s"} late`,
        });
    }

    if (contributions[0]) {
        const goal = await Goal.findById(contributions[0].goalId).select("name").lean();
        if (goal) {
            moments.push({
                date: new Date(contributions[0].createdAt).toISOString(),
                kind: "win",
                text: `${formatAmount(contributions[0].amount, currency)} added to ${goal.name}`,
            });
        }
    }

    // A month's own daily buckets, reused rather than re-queried — the same aggregate
    // /insights already runs for the month's trend chart. Not run for a week: there's
    // nothing to sub-divide a single week into.
    if (period === "month") {
        const daily = await getTrend(start, end, "month", zone, req);
        const standout = bestWorstWeek(daily);
        if (standout) {
            moments.push({
                date: new Date(standout.startDate).toISOString(),
                kind: standout.kind === "low" ? "win" : "warn",
                text: standout.kind === "low"
                    ? `Your lightest week this period — ${formatAmount(standout.total, currency)} spent`
                    : `Your heaviest week this period — ${formatAmount(standout.total, currency)} spent`,
            });
        }
    }

    moments.push({
        date: end.toISOString(),
        kind: saved >= 0 ? "win" : "neutral",
        text: `Period closes: ${formatAmount(saved, currency)} saved`,
    });

    return moments.sort((a, b) => a.date.localeCompare(b.date));
};
