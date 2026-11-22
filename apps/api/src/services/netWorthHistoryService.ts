import mongoose from "mongoose";
import Account from "../models/Account";
import Transaction from "../models/Transaction";
import { addMonthsInZone, startOfMonthInZone, partsInZone } from "../utils/timezone";
import { monthOrdinal, AVERAGE_MONTHS } from "./highlightSnapshotMath";
import { reconstructTrend, type MonthDelta } from "./netWorthMath";

// Account.balance is a live running total (mutated by $inc as transactions land) — there
// is no stored balance history anywhere. Reconstructing past net worth means walking
// backward from the current total by each month's own delta.
//
// History covers the same accounts as today's figure (D24): the user's accounts that are not
// archived. A month's delta is what its rows did to THOSE balances — income/positiveAdjustment
// add and expense/negativeAdjustment subtract when they sit on one, and a transfer counts only
// the legs that land on one (so between two of them it nets to zero). Archiving an account
// then changes no past point. This can't reuse highlightSnapshotMath's Snapshot.months — that
// aggregation deliberately excludes both adjustment types, which move the balance even though
// they aren't income or spending.

const ymKey = (instant: Date, zone: string): string => {
  const { year, month } = partsInZone(instant, zone);
  return `${year}-${String(month).padStart(2, "0")}`;
};

const monthLabel = (instant: Date, zone: string): string =>
  new Intl.DateTimeFormat("en-IN", { timeZone: zone, month: "short", year: "numeric" }).format(instant);

export type NetWorthPoint = { label: string; total: number };
/** `tripExpense` is the part of `expense` that is your trip shares. */
export type MonthlyFlowPoint = { label: string; income: number; expense: number; tripExpense: number };

type MonthRow = { _id: string; income: number; expense: number; tripExpense: number; delta: number };

/** Per zone-local month from `since`: income and expense over every row (what the flow
 *  figures always meant), and the net-worth delta over the accounts today's figure counts. */
const monthRows = async (oid: mongoose.Types.ObjectId, zone: string, since: Date): Promise<MonthRow[]> => {
  const live = await Account.find({ userId: oid, isArchived: false }).distinct("_id");
  const on = (field: string) => ({ $in: [field, live] });
  const amountIf = (cond: unknown) => ({ $cond: [cond, "$amount", 0] });

  return Transaction.aggregate<MonthRow>([
    {
      $match: {
        userId: oid,
        type: { $in: ["income", "expense", "positiveAdjustment", "negativeAdjustment", "transfer"] },
        occurredAt: { $gte: since },
      },
    },
    {
      $group: {
        _id: { $dateToString: { date: "$occurredAt", format: "%Y-%m", timezone: zone } },
        income: { $sum: amountIf({ $eq: ["$type", "income"] }) },
        expense: { $sum: amountIf({ $eq: ["$type", "expense"] }) },
        tripExpense: { $sum: amountIf({ $and: [{ $eq: ["$type", "expense"] }, { $gt: ["$tripId", null] }] }) },
        delta: {
          $sum: {
            $switch: {
              branches: [
                { case: { $in: ["$type", ["income", "positiveAdjustment"]] }, then: amountIf(on("$account")) },
                { case: { $in: ["$type", ["expense", "negativeAdjustment"]] }, then: { $subtract: [0, amountIf(on("$account"))] } },
                { case: { $eq: ["$type", "transfer"] }, then: { $subtract: [amountIf(on("$toAccount")), amountIf(on("$account"))] } },
              ],
              default: 0,
            },
          },
        },
      },
    },
  ]);
};

const deltasOf = (rows: MonthRow[]): MonthDelta[] => rows.map((r) => ({ key: r._id, delta: r.delta }));

/**
 * Current net worth + up to `AVERAGE_MONTHS` prior complete-month boundaries, oldest
 * first, floored to however much history the account actually has. Length 1 (current
 * only) for an account younger than one complete month — a boundary that predates the
 * account's first transaction isn't a real point, it's an artifact of the arithmetic.
 *
 * `monthlyFlow` rides along on the SAME query — each complete reference month's own
 * income/expense, same order, one entry shorter than `points` since it excludes the current
 * (still partial) month. The caller already knows this month's own income/expense from its
 * own aggregate and appends that itself.
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
    // `monthlyFlow` is the complete month BEFORE each boundary, so the query reaches one month
    // further back. `reconstructTrend` only sums months at or after a boundary, so the extra
    // month's rows don't move `points`.
    const rows = await monthRows(oid, zone, addMonthsInZone(earliestBoundary, zone, -1));
    const flowByMonth = new Map(rows.map((r) => [r._id, r]));

    // Oldest boundary first.
    const boundaries: Date[] = [];
    for (let k = monthsAvailable; k >= 1; k--) {
      boundaries.push(addMonthsInZone(currentMonthStart, zone, -(k - 1)));
    }
    const totals = reconstructTrend(currentNetWorth, deltasOf(rows), boundaries.map((boundary) => ymKey(boundary, zone)));

    boundaries.forEach((boundary, i) => {
      // A boundary is the instant a month closed, so it is named for that month (gaps row 26):
      // the 1 April point is March's closing figure, "Mar 2026", not a second "Apr 2026".
      const month = addMonthsInZone(boundary, zone, -1);
      points.push({ label: monthLabel(month, zone), total: totals[i] });
      const flow = flowByMonth.get(ymKey(month, zone));
      monthlyFlow.push({ label: monthLabel(month, zone), income: flow?.income ?? 0, expense: flow?.expense ?? 0, tripExpense: flow?.tripExpense ?? 0 });
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

  const rows = await monthRows(oid, zone, earliest);
  const totals = reconstructTrend(currentNetWorth, deltasOf(rows), boundaries.map((b) => ymKey(b, zone)));

  return boundaries.map((boundary, i) => (boundary < firstTxnAt ? null : totals[i]));
};
