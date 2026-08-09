import { Request, Response } from "express";
import { insightsQuerySchema } from "../schemas/insightsSchema";
import * as reply from "../utils/response";
import { addDays, addMonths, addYears, differenceInDays, subDays, subMonths, subYears } from "date-fns";
import Category from "../models/Category";
import Transaction from "../models/Transaction";
import mongoose from "mongoose";
import Account from "../models/Account";

// GET /insights?period=week|month|year

/*
type InsightsPeriod = "week" | "month" | "year"

interface InsightsSummary {
  period: InsightsPeriod
  trend:           { date: string; amount: number }[]                          // expenses per day|month, current window
  incomeVsExpense: { periodStart: string; income: number; expense: number }[]  // 6 units; last two = current & previous totals
  byCategory:      { categoryId: string; name: string; total: number }[]       // desc, parent-rolled, current window
  byAccount:       { accountId: string;  name: string; total: number }[]       // desc, current window
  txnCount:        number                                                       // non-transfer count, current window
  // insight sentence: later
}

 */

export const getInsights = async (req: Request, res: Response): Promise<void> => {

    const { period, offset } = insightsQuerySchema.parse(req.query);

    const { currentStartDate, currentEndDate, previousStartDate, previousEndDate } = parsePeriod(period, offset);

    const trend = await getTrend(currentStartDate, currentEndDate, period, req);
    const incomeVsExpense = await getIncomeVsExpense(currentStartDate, currentEndDate, period, req);
    const byCategory = await getCategoryBreakDown(currentStartDate, currentEndDate, req);
    const byAccount = await getAccountBreakDown(currentStartDate, currentEndDate, req);
    const avgDailySpendCurrent = await getAverageSpend(currentStartDate, currentEndDate, req);
    const avgDailySpendPrevious = await getAverageSpend(previousStartDate, previousEndDate, req);
    const topCategory = await getTopCategory(byCategory);
    const txnCount = await Transaction.countDocuments({
        userId: req.user?.userId,
        type: { $in: ["expense", "income"] },
        occurredAt: { $gte: currentStartDate, $lt: currentEndDate }
    })

    reply.ok(res, { period, periodStart: currentStartDate, periodEnd: currentEndDate, trend, incomeVsExpense, byCategory, byAccount, avgDailySpendCurrent, avgDailySpendPrevious, topCategory, txnCount }, "Insights fetched successfully");
}

type periodType = {
    currentStartDate: Date,
    currentEndDate: Date,
    previousStartDate: Date,
    previousEndDate: Date
}

// `offset` slides the whole window back by that many periods (0 = current, -1 =
// previous, …). The anchor still starts from the unit that contains "now", so
// switching period type always re-anchors to the current week/month/year.
const parsePeriod = (period: string, offset: number): periodType => {

    const currentDate = new Date();
    const currentYear = currentDate.getUTCFullYear();
    const currentMonth = currentDate.getUTCMonth();
    const currentDD = currentDate.getUTCDate();
    let currentDay = currentDate.getUTCDay();
    if (currentDay === 0) {
        currentDay = 7;
    }

    if (period === "year") {
        const currentStartDate = addYears(Date.UTC(currentYear, 0, 1), offset);
        const currentEndDate = addYears(currentStartDate, 1);
        return {
            currentStartDate,
            currentEndDate,
            previousStartDate: subYears(currentStartDate, 1),
            previousEndDate: subYears(currentEndDate, 1)
        }
    }
    if (period === "month") {
        const currentStartDate = addMonths(Date.UTC(currentYear, currentMonth, 1), offset);
        const currentEndDate = addMonths(currentStartDate, 1);
        return {
            currentStartDate,
            currentEndDate,
            previousStartDate: subMonths(currentStartDate, 1),
            previousEndDate: subMonths(currentEndDate, 1)
        }
    }
    else {
        const thisWeekStart = subDays(Date.UTC(currentYear, currentMonth, currentDD), currentDay - 1);
        const currentStartDate = addDays(thisWeekStart, offset * 7);
        const currentEndDate = addDays(currentStartDate, 7)
        return {
            currentStartDate,
            currentEndDate,
            previousStartDate: subDays(currentStartDate, 7),
            previousEndDate: subDays(currentEndDate, 7)
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

const getAverageSpend = async (startTime: Date, endTime: Date, req: Request) => {
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
        ? differenceInDays(now, startTime) + 1
        : differenceInDays(endTime, startTime);

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

const getIncomeVsExpense = async (startTime: Date, endTime: Date, period: string, req: Request) => {

    // The 6 unit-starts, oldest -> newest (newest = the current period start).
    const buckets: Date[] = [];
    for (let i = 5; i >= 0; i--) {
        if (period === "year") buckets.push(subYears(startTime, i));
        else if (period === "month") buckets.push(subMonths(startTime, i));
        else buckets.push(subDays(startTime, i * 7));
    }

    const unit = period === "year" ? "year" : period === "month" ? "month" : "week";
    const truncSpec: Record<string, unknown> = { date: "$occurredAt", unit };
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

    // Zero-fill so the client always gets exactly 6 units in order.
    const byStart = new Map<number, { income: number; expense: number }>();
    for (const row of rows) {
        byStart.set(new Date(row._id).getTime(), { income: row.income, expense: row.expense });
    }

    return buckets.map((start) => {
        const hit = byStart.get(start.getTime());
        return { periodStart: start, income: hit?.income ?? 0, expense: hit?.expense ?? 0 };
    });
}

const getTrend = async (startTime: Date, endTime: Date, period: string, req: Request) => {
    const trend = await Transaction.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(req.user!.userId),
                type: "expense",
                occurredAt: { $gte: startTime, $lt: endTime }
            }
        },
        {
            $group: {
                _id: {
                    $dateTrunc: {
                        date: "$occurredAt",
                        unit: period === "year" ? "month" : "day"
                    }
                },
                total: { $sum: "$amount" }
            }
        },
        {
            $project: {
                _id: 0,
                date: "$_id",
                amount: "$total"
            }
        },
        {
            $sort: {
                date: 1
            }
        }
    ]);

    return trend;
}