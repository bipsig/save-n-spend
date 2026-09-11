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
import { AppError } from "../utils/AppError";

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
    // Not stopped early — that period is over. The client compares the two by bucket index,
    // which is what makes a 28-day February line up against a 31-day January.
    const previousTrend = await getTrend(previousStartDate, previousEndDate, period, zone, req);
    const incomeVsExpense = await getIncomeVsExpense(currentStartDate, currentEndDate, period, zone, req);
    const byCategory = await getCategoryBreakDown(currentStartDate, currentEndDate, req);
    const previousByCategory = await getCategoryBreakDown(previousStartDate, previousEndDate, req);
    const categoryCompare = buildCategoryCompare(byCategory, previousByCategory);
    const byAccount = await getAccountBreakDown(currentStartDate, currentEndDate, req);
    const avgDailySpendCurrent = await getAverageSpend(currentStartDate, currentEndDate, zone, req);
    const avgDailySpendPrevious = await getAverageSpend(previousStartDate, previousEndDate, zone, req);
    const topCategory = await getTopCategory(byCategory);
    const txnCount = await Transaction.countDocuments({
        userId: req.user?.userId,
        type: { $in: ["expense", "income"] },
        occurredAt: { $gte: currentStartDate, $lt: currentEndDate }
    })

    reply.ok(res, { period, timeZone: zone, periodStart: currentStartDate, periodEnd: currentEndDate, trend, previousTrend, incomeVsExpense, byCategory, categoryCompare, byAccount, avgDailySpendCurrent, avgDailySpendPrevious, topCategory, txnCount }, "Insights fetched successfully");
}

/**
 * GET /insights/category/:id?period=&offset=
 *
 * One category over the same window the breakdown was showing. Every figure is ROLLED UP —
 * the category plus its children — so the total here is the number on the row that led to it.
 * `children` is the split behind it.
 */
export const getCategoryInsights = async (req: Request, res: Response): Promise<void> => {
    const { id: categoryId } = req.params;
    const { period, offset } = insightsQuerySchema.parse(req.query);
    const zone = await resolveZone(req);

    const { currentStartDate, currentEndDate, previousStartDate, previousEndDate } = parsePeriod(period, offset, zone);

    // Archived is allowed through: a window in the past can be all spend on a category the
    // user has since retired, and the row in the breakdown that led here still exists.
    const category = await Category.findOne({
        _id: categoryId,
        userId: req.user?.userId
    }).select("_id name parent").lean();

    if (!category) {
        throw AppError.notFound("Category not found");
    }

    const children = category.parent
        ? []
        : await Category.find({ userId: req.user?.userId, parent: category._id }).select("_id name").lean();

    // A sub-category's own detail rolls up nothing, since the tree is only two deep.
    const scope = [category._id, ...children.map((c) => c._id)];
    const childNames = new Map(children.map((c) => [c._id.toString(), c.name]));

    const spendByCategory = async (startTime: Date, endTime: Date) => Transaction.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(req.user!.userId),
                type: "expense",
                category: { $in: scope },
                occurredAt: { $gte: startTime, $lt: endTime }
            }
        },
        {
            $group: {
                _id: "$category",
                total: { $sum: "$amount" },
                count: { $sum: 1 }
            }
        }
    ]);

    const currentRows = await spendByCategory(currentStartDate, currentEndDate);
    const previousRows = await spendByCategory(previousStartDate, previousEndDate);

    const total = currentRows.reduce((sum, row) => sum + row.total, 0);
    const previousTotal = previousRows.reduce((sum, row) => sum + row.total, 0);
    const txnCount = currentRows.reduce((sum, row) => sum + row.count, 0);

    const childSlices = currentRows
        .filter((row) => row._id && row._id.toString() !== category._id.toString())
        .map((row) => ({
            categoryId: row._id.toString(),
            name: childNames.get(row._id.toString()) ?? "Uncategorised",
            total: row.total
        }))
        .sort((a, b) => b.total - a.total);

    const allSpend = await Transaction.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(req.user!.userId),
                type: "expense",
                occurredAt: { $gte: currentStartDate, $lt: currentEndDate }
            }
        },
        { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    const windowSpend = allSpend[0]?.total ?? 0;
    const trend = await getTrend(currentStartDate, currentEndDate, period, zone, req, scope);

    const parent = category.parent
        ? await Category.findById(category.parent).select("name").lean()
        : null;

    reply.ok(res, {
        categoryId: category._id.toString(),
        name: category.name,
        ...(parent?.name ? { parentName: parent.name } : {}),
        period,
        timeZone: zone,
        periodStart: currentStartDate,
        periodEnd: currentEndDate,
        total,
        previousTotal,
        shareOfSpend: windowSpend > 0 ? (total / windowSpend) * 100 : 0,
        txnCount,
        trend,
        children: childSlices
    }, "Category insights fetched successfully");
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

type CategorySlice = {
    categoryId: string,
    name: string,
    total: number,
    children?: CategorySlice[]
}

/**
 * Spend per top-level category, with the sub-categories behind each total kept alongside it
 * rather than dissolved into it.
 *
 * `total` is still the rolled-up figure — that is what a budget on the category governs, and
 * what the donut has to add up to — but `children` carries the split, so the breakdown can be
 * drilled into without a second request and without the client guessing at the tree.
 *
 * Archived categories are included in the name lookup on purpose: spend filed under one before
 * it was archived still needs something to be called.
 */
const getCategoryBreakDown = async (startTime: Date, endTime: Date, req: Request): Promise<CategorySlice[]> => {
    const categories = await Category.find({
        userId: req.user?.userId
    })
        .select("_id name parent")
        .lean();

    const byId = new Map(categories.map((c) => [c._id.toString(), c]));
    const nameOf = (id: string) => byId.get(id)?.name ?? "Uncategorised";

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

    // Keyed by the top-level id in both: `rolled` is the figure the row shows, `split` is
    // what it is made of. The tree is two deep (enforced at create), so no recursion.
    const rolled = new Map<string, number>();
    const split = new Map<string, Map<string, number>>();

    for (const row of categorySpend) {
        if (!row._id) continue;

        const id = row._id.toString();
        const parent = byId.get(id)?.parent;
        const rootId = parent ? parent.toString() : id;

        rolled.set(rootId, (rolled.get(rootId) ?? 0) + row.total);

        if (parent) {
            const kids = split.get(rootId) ?? new Map<string, number>();
            kids.set(id, (kids.get(id) ?? 0) + row.total);
            split.set(rootId, kids);
        }
    }

    const result: CategorySlice[] = [];
    for (const [id, total] of rolled) {
        const kids = split.get(id);
        const children = kids
            ? [...kids]
                .map(([childId, childTotal]) => ({ categoryId: childId, name: nameOf(childId), total: childTotal }))
                .sort((a, b) => b.total - a.total)
            : undefined;

        result.push({ categoryId: id, name: nameOf(id), total, ...(children?.length ? { children } : {}) });
    }

    result.sort((a, b) => b.total - a.total);

    return result;
}

/**
 * The same categories in both windows, ordered by how much the figure MOVED — not by size.
 * A category that is always the largest says nothing; one that doubled is the reason to look.
 *
 * Categories with spend last period and none now are carried in at 0, because that drop is
 * exactly the kind of change the card exists to show.
 */
const buildCategoryCompare = (current: CategorySlice[], previous: CategorySlice[]) => {
    const previousTotals = new Map(previous.map((s) => [s.categoryId, s.total]));

    const rows = current.map((s) => ({
        categoryId: s.categoryId,
        name: s.name,
        current: s.total,
        previous: previousTotals.get(s.categoryId) ?? 0
    }));

    const seen = new Set(current.map((s) => s.categoryId));
    for (const s of previous) {
        if (seen.has(s.categoryId)) continue;
        rows.push({ categoryId: s.categoryId, name: s.name, current: 0, previous: s.total });
    }

    rows.sort((a, b) => Math.abs(b.current - b.previous) - Math.abs(a.current - a.previous));

    return rows;
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
 *
 * `categoryIds` narrows it to one category and its children — the same series, for the
 * detail screen.
 */
const getTrend = async (
    startTime: Date,
    endTime: Date,
    period: string,
    zone: string,
    req: Request,
    categoryIds?: mongoose.Types.ObjectId[]
) => {
    const monthly = period === "year";

    const rows = await Transaction.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(req.user!.userId),
                type: "expense",
                ...(categoryIds ? { category: { $in: categoryIds } } : {}),
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
