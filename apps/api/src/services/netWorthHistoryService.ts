import mongoose from "mongoose";
import Transaction from "../models/Transaction";
import { addMonthsInZone, startOfMonthInZone, partsInZone } from "../utils/timezone";
import { monthOrdinal, AVERAGE_MONTHS } from "./highlightSnapshotMath";
import { reconstructTrend, type MonthDelta } from "./netWorthMath";

// Account.balance is a live running total (mutated by $inc as transactions land) — there
// is no stored balance history anywhere. Reconstructing past net worth means walking
// backward from the current total by each month's own delta: income/positiveAdjustment
// add, expense/negativeAdjustment subtract, and a transfer nets to zero across the user's
// full account set (both legs, including a `person`-type account, are already inside the
// same summed total) so it never needs subtracting. This can't reuse
// highlightSnapshotMath's Snapshot.months — that aggregation deliberately excludes both
// adjustment types, which move the balance even though they aren't income or spending.

const ymKey = (instant: Date, zone: string): string => {
  const { year, month } = partsInZone(instant, zone);
  return `${year}-${String(month).padStart(2, "0")}`;
};

const monthLabel = (instant: Date, zone: string): string =>
  new Intl.DateTimeFormat("en-IN", { timeZone: zone, month: "short", year: "numeric" }).format(instant);

export type NetWorthPoint = { label: string; total: number };
export type MonthlyFlowPoint = { label: string; income: number; expense: number };

/**
 * Current net worth + up to `AVERAGE_MONTHS` prior complete-month boundaries, oldest
 * first, floored to however much history the account actually has. Length 1 (current
 * only) for an account younger than one complete month — a boundary that predates the
 * account's first transaction isn't a real point, it's an artifact of the arithmetic.
 *
 * `monthlyFlow` rides along on the SAME query (the aggregate already groups income/
 * expense per month before this function collapses them into a single delta) — each
 * complete reference month's own income/expense, same order, one entry shorter than
 * `points` since it excludes the current (still partial) month. The caller already
 * knows this month's own income/expense from its own aggregate and appends that itself.
 */
export const netWorthTrend = async (
  userId: string | mongoose.Types.ObjectId,
  zone: string,
  now: Date,
  currentNetWorth: number,
  firstTxnAt: Date,
): Promise<{ points: NetWorthPoint[]; monthlyFlow: MonthlyFlowPoint[] }> => {
  const oid = new mongoose.Types.ObjectId(String(userId));
  const monthsAvailable = Math.min(
    AVERAGE_MONTHS,
    Math.max(0, monthOrdinal(now, zone) - monthOrdinal(firstTxnAt, zone)),
  );

  const points: NetWorthPoint[] = [];
  const monthlyFlow: MonthlyFlowPoint[] = [];

  if (monthsAvailable > 0) {
    const currentMonthStart = startOfMonthInZone(now, zone);
    const earliestBoundary = addMonthsInZone(currentMonthStart, zone, -(monthsAvailable - 1));

    const rows = await Transaction.aggregate<{ _id: string; income: number; expense: number; posAdj: number; negAdj: number }>([
      {
        $match: {
          userId: oid,
          type: { $in: ["income", "expense", "positiveAdjustment", "negativeAdjustment"] },
          occurredAt: { $gte: earliestBoundary },
        },
      },
      {
        $group: {
          _id: { $dateToString: { date: "$occurredAt", format: "%Y-%m", timezone: zone } },
          income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } },
          expense: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } },
          posAdj: { $sum: { $cond: [{ $eq: ["$type", "positiveAdjustment"] }, "$amount", 0] } },
          negAdj: { $sum: { $cond: [{ $eq: ["$type", "negativeAdjustment"] }, "$amount", 0] } },
        },
      },
    ]);

    const deltas: MonthDelta[] = rows.map((r) => ({ key: r._id, delta: r.income - r.expense + r.posAdj - r.negAdj }));
    const flowByMonth = new Map(rows.map((r) => [r._id, { income: r.income, expense: r.expense }]));

    // Oldest boundary first.
    const boundaries: Date[] = [];
    for (let k = monthsAvailable; k >= 1; k--) {
      boundaries.push(addMonthsInZone(currentMonthStart, zone, -(k - 1)));
    }
    const boundaryKeys = boundaries.map((boundary) => ymKey(boundary, zone));
    const totals = reconstructTrend(currentNetWorth, deltas, boundaryKeys);

    boundaries.forEach((boundary, i) => {
      points.push({ label: monthLabel(boundary, zone), total: totals[i] });
      const flow = flowByMonth.get(boundaryKeys[i]) ?? { income: 0, expense: 0 };
      monthlyFlow.push({ label: monthLabel(boundary, zone), income: flow.income, expense: flow.expense });
    });
  }

  points.push({ label: monthLabel(now, zone), total: currentNetWorth });
  return { points, monthlyFlow };
};

/**
 * Net worth at each of `boundaries` (month-start instants, any number of months back —
 * unlike `netWorthTrend`, not capped at `AVERAGE_MONTHS` or anchored to "the last few
 * months from today"). Built for Month in Review: `previousTotal`/`total` are just the
 * net worth at a reviewed month's own start/end, i.e. `[currentStartDate, currentEndDate]`
 * from `parsePeriod`. Returns null (not zero) for a boundary that predates the account's
 * first transaction — a walk-back through history that never happened isn't a real number.
 */
export const netWorthAtBoundaries = async (
  userId: string | mongoose.Types.ObjectId,
  zone: string,
  currentNetWorth: number,
  firstTxnAt: Date,
  boundaries: Date[],
): Promise<(number | null)[]> => {
  const oid = new mongoose.Types.ObjectId(String(userId));
  const earliest = boundaries.reduce((a, b) => (b < a ? b : a));

  const rows = await Transaction.aggregate<{ _id: string; income: number; expense: number; posAdj: number; negAdj: number }>([
    {
      $match: {
        userId: oid,
        type: { $in: ["income", "expense", "positiveAdjustment", "negativeAdjustment"] },
        occurredAt: { $gte: earliest },
      },
    },
    {
      $group: {
        _id: { $dateToString: { date: "$occurredAt", format: "%Y-%m", timezone: zone } },
        income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } },
        expense: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } },
        posAdj: { $sum: { $cond: [{ $eq: ["$type", "positiveAdjustment"] }, "$amount", 0] } },
        negAdj: { $sum: { $cond: [{ $eq: ["$type", "negativeAdjustment"] }, "$amount", 0] } },
      },
    },
  ]);

  const deltas: MonthDelta[] = rows.map((r) => ({ key: r._id, delta: r.income - r.expense + r.posAdj - r.negAdj }));
  const boundaryKeys = boundaries.map((b) => ymKey(b, zone));
  const totals = reconstructTrend(currentNetWorth, deltas, boundaryKeys);

  return boundaries.map((boundary, i) => (boundary < firstTxnAt ? null : totals[i]));
};
