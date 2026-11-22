import { Request, Response } from "express"
import type { Valid } from "../middleware/validate";
import { dashboardHealthSchemas, dashboardInsightsSchemas, dashboardSummarySchemas } from "../schemas/dashboardSchema"
import Transaction from "../models/Transaction";
import Goal from "../models/Goal";
import * as reply from "../utils/response";
import Account from "../models/Account";
import mongoose from "mongoose";
import { monthRange } from "../utils/monthRange";
import { resolveZone } from "../utils/userZone";
import { startOfWeekInZone, addDaysInZone, addMonthsInZone, startOfMonthInZone, partsInZone } from "../utils/timezone";
import { monthOrdinal, wholeDays, AVERAGE_MONTHS } from "../services/highlightSnapshotMath";
import { healthScore } from "../services/healthService";
import { goalPace } from "../services/goalPace";
import { computeCurrentStreak } from "../services/highlightSnapshotService";
import { netWorthTrend } from "../services/netWorthHistoryService";
import { averageByDayOfMonth } from "../services/paceMath";
import { netWorthAtBoundaries } from "../services/netWorthHistoryService";
import { everydayMatch, rowsFor, tripRule, type TripRule } from "../services/tripEntries";
import { addYearsInZone, startOfYearInZone, startOfDayInZone } from "../utils/timezone";

/** Income and spending between two instants (either open-ended when null); `tripExpenses` is
 *  the trip part of `expenses`. */
const flowSums = async (rule: TripRule, userId: mongoose.Types.ObjectId, from: Date | null, to: Date | null) => {
  const occurredAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lt: to } : {}) };
  const rows = await Transaction.aggregate<{ _id: string; total: number; trips: number }>([
    ...rowsFor(rule, { userId, type: { $in: ["income", "expense"] }, ...(from || to ? { occurredAt } : {}) }),
    { $group: { _id: "$type", total: { $sum: "$amount" }, trips: { $sum: { $cond: [{ $gt: ["$tripId", null] }, "$amount", 0] } } } },
  ]);
  const expense = rows.find((r) => r._id === "expense");
  return { income: rows.find((r) => r._id === "income")?.total ?? 0, expenses: expense?.total ?? 0, tripExpenses: expense?.trips ?? 0 };
};

const expenseRow = (row: { title?: unknown; amount?: unknown; occurredAt?: unknown } | undefined) =>
  row ? { title: row.title as string, amount: row.amount as number, occurredAt: row.occurredAt as Date } : null;

export const getDashboardSummary = async (req: Request, res: Response): Promise<void> => {

  const { query: { month, since, period, trips } } = req.valid as Valid<typeof dashboardSummarySchemas>;
  const zone = await resolveZone(req);
  const now = new Date();
  const userId = new mongoose.Types.ObjectId(req.user!.userId);
  const rule = tripRule(trips, zone);

  // Shared with GET /budgets rather than cut here: the dashboard's "this month" and a
  // budget's month are the same month by definition, and two implementations drift.
  const { start, next, label } = monthRange(zone, month);

  const weekStart = startOfWeekInZone(now, zone);
  const weekEnd = addDaysInZone(weekStart, zone, 7);

  // Sourced directly rather than through GET /highlights: that endpoint only surfaces
  // the streak when it clears the materiality-ranked, max-4 cap, so a real streak could
  // go silently missing on a busy day — wrong for a badge meant to always be visible.
  // `trips` is the part of each total that is trip shares, so the app can show everyday
  // spending with a "Plus ₹X on trips" line while `total` keeps its 2.8.1 meaning.
  const flowGroup = { _id: "$type", total: { $sum: "$amount" }, trips: { $sum: { $cond: [{ $gt: ["$tripId", null] }, "$amount", 0] } } };

  const [currentStreak, monthlySums, netWorth, weekSums, biggestExpense, biggestEverydayExpense, sinceLastOpened, first] = await Promise.all([
    computeCurrentStreak(req.user!.userId, zone, now),
    Transaction.aggregate([
      ...rowsFor(rule, { userId, type: { $in: ["income", "expense"] }, occurredAt: { $gte: start, $lt: next } }),
      { $group: flowGroup }
    ]),
    Account.aggregate([
      { $match: { userId, isArchived: false } },
      { $group: { _id: null, total: { $sum: "$balance" } } }
    ]),
    // This week, not this month — a tighter feedback loop than the monthly figures
    // above, which barely move day to day.
    Transaction.aggregate([
      ...rowsFor(rule, { userId, type: { $in: ["income", "expense"] }, occurredAt: { $gte: weekStart, $lt: weekEnd } }),
      { $group: flowGroup }
    ]),
    // Symmetric with `monthlySums` above — same match, sorted and capped at one instead
    // of grouped, so the single expense that moved the month's number most can be named.
    Transaction.aggregate([
      ...rowsFor(rule, { userId, type: "expense", occurredAt: { $gte: start, $lt: next } }),
      { $sort: { amount: -1 } },
      { $limit: 1 },
      { $project: { title: 1, amount: 1, occurredAt: 1 } }
    ]),
    // The same, everyday spending only (D21): the 2.8.1 field above may name a trip share.
    // Under 2.8.6 a closed trip is an ordinary expense and may be the biggest.
    Transaction.aggregate([
      ...rowsFor(rule, everydayMatch(rule, { userId, type: "expense", occurredAt: { $gte: start, $lt: next } })),
      { $sort: { amount: -1 } },
      { $limit: 1 },
      { $project: { title: 1, amount: 1, occurredAt: 1 } }
    ]),
    since
      ? Transaction.aggregate([
        ...rowsFor(rule, { userId, type: "expense", occurredAt: { $gte: new Date(since) } }),
        { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$amount" }, trips: { $sum: { $cond: [{ $gt: ["$tripId", null] }, "$amount", 0] } } } }
      ])
      : Promise.resolve(null),
    Transaction.findOne({ userId }).sort({ occurredAt: 1 }).select("occurredAt").lean()
  ]);

  const income = monthlySums.find((res) => res._id === "income")?.total ?? 0;
  const expenses = monthlySums.find((res) => res._id === "expense")?.total ?? 0;
  const tripExpenses = monthlySums.find((res) => res._id === "expense")?.trips ?? 0;
  const weekIncome = weekSums.find((res) => res._id === "income")?.total ?? 0;
  const weekExpense = weekSums.find((res) => res._id === "expense")?.total ?? 0;
  const weekTripExpense = weekSums.find((res) => res._id === "expense")?.trips ?? 0;
  const currentNetWorth = netWorth[0]?.total ?? 0;

  // Home's Month / Year / All time switch (2.8.6), only when asked for: without `period` the
  // body is the 2.8.5 one. The four tiles' figures cover the period; the rest stays on this month.
  let periodFields: Record<string, unknown> = {};
  let periodTotals = { income, expenses, tripExpenses };
  if (period) {
    const firstAt = first?.occurredAt ? new Date(first.occurredAt) : null;
    const window = period === "month"
      ? { from: start, to: next, prevFrom: addMonthsInZone(start, zone, -1) }
      : period === "year"
        ? { from: startOfYearInZone(now, zone), to: addYearsInZone(startOfYearInZone(now, zone), zone, 1), prevFrom: addYearsInZone(startOfYearInZone(now, zone), zone, -1) }
        : { from: null, to: null, prevFrom: null };
    const totals = period === "month" ? { income, expenses, tripExpenses } : await flowSums(rule, userId, window.from, window.to);
    // Nothing to compare with when the records start inside this period.
    const hasPrevious = window.from && window.prevFrom && firstAt && firstAt < window.from;
    const previous = hasPrevious ? await flowSums(rule, userId, window.prevFrom, window.from) : null;
    const [atStart] = window.from && firstAt
      ? await netWorthAtBoundaries(userId, zone, currentNetWorth, firstAt, [window.from])
      : [null];
    periodTotals = totals;
    periodFields = {
      period,
      periodStart: window.from ? window.from.toISOString() : firstAt ? startOfDayInZone(firstAt, zone).toISOString() : null,
      firstRecordAt: firstAt ? firstAt.toISOString() : null,
      previous: previous ? { ...previous, savings: previous.income - previous.expenses } : null,
      netWorthAtStart: atStart ?? null,
    };
  }

  // A brand-new account with no transactions yet has no history to reconstruct — a
  // single "now" point, same as the service's own floor for a young one.
  const { points: trend, monthlyFlow } = first
    ? await netWorthTrend(req.user!.userId, zone, now, currentNetWorth, first.occurredAt)
    : { points: [{ label, total: currentNetWorth }], monthlyFlow: [] };

  // This month's own totals close out the same series — the service only knows about
  // complete PRIOR months, and this controller already has this month's from monthlySums.
  const flowTrend = [...monthlyFlow, { label, income, expense: expenses, tripExpense: tripExpenses }];

  const response = {
    month: label,
    income: periodTotals.income,
    expenses: periodTotals.expenses,
    tripExpenses: periodTotals.tripExpenses,
    savings: periodTotals.income - periodTotals.expenses,
    ...periodFields,
    netWorth: currentNetWorth,
    netWorthTrend: trend,
    flowTrend,
    currentStreak,
    weekIncome,
    weekExpense,
    weekTripExpense,
    biggestExpense: expenseRow(biggestExpense[0]),
    biggestEverydayExpense: expenseRow(biggestEverydayExpense[0]),
    sinceLastOpened: sinceLastOpened
      ? { transactions: sinceLastOpened[0]?.count ?? 0, spent: sinceLastOpened[0]?.total ?? 0, tripSpent: sinceLastOpened[0]?.trips ?? 0 }
      : undefined
  };

  reply.ok(res, response, "Dashboard summary fetched");
}

/**
 * The financial health score. No window to choose — unlike the summary it is always "as of
 * now", over a trailing window rather than a named month; `trips=entries` only picks the
 * 2.8.6 trips rule. See services/healthService.
 */
export const getHealthScore = async (req: Request, res: Response): Promise<void> => {
  const zone = await resolveZone(req);
  const trips = (req.valid as Valid<typeof dashboardHealthSchemas> | undefined)?.query.trips;
  const score = await healthScore(req.user!.userId, zone, new Date(), tripRule(trips, zone));

  reply.ok(res, score, "Health score fetched");
}

/** Consecutive-day-of-week Monday-first index (0=Mon .. 6=Sun) from Mongo's own
 *  Sunday-first `$dayOfWeek` (1=Sun .. 7=Sat) — matches the Monday-first convention
 *  `startOfWeekInZone`/the mobile app's own heatmap already use. */
const mondayFirst = (mongoDayOfWeek: number): number => (mongoDayOfWeek + 5) % 7;
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** One grouped row of expense: `total` with trips, `everyday` without. */
type DaySums<K> = { _id: K; total: number; everyday: number };
type Pick = (row: DaySums<string | number>) => number;

/** "YYYY-MM-DD" in `zone` — matches the $dateToString format the aggregations below
 *  group by, so a value built from this always looks up correctly against them. */
const dayKey = (instant: Date, zone: string): string => {
  const { year, month, day } = partsInZone(instant, zone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

/**
 * The "For You" carousel's genuinely-new slides — a goal's pace-based ETA, a no-spend-day
 * count, and a weekday spending pattern. Kept off GET /dashboard/summary: these are
 * ranked/omit-shaped and chart-series-shaped, not scalars that response otherwise deals in.
 */
export const getDashboardInsights = async (req: Request, res: Response): Promise<void> => {
  const zone = await resolveZone(req);
  // Under `trips=entries` the "all" series hold each closed trip on its close day (no-spend
  // days, heatmap, pace); `everyday` is then the same with no trip at all.
  const rule = tripRule((req.valid as Valid<typeof dashboardInsightsSchemas> | undefined)?.query.trips, zone);
  const now = new Date();
  const userId = new mongoose.Types.ObjectId(req.user!.userId);
  const { start, next } = monthRange(zone);
  const daysElapsed = partsInZone(now, zone).day;

  const [goals, expenseDays, weekdayRows, first] = await Promise.all([
    Goal.find({ userId }).select("name target saved createdAt").lean(),
    // Also carries `total` per day — feeds both the no-spend-day count and the
    // pace-vs-average chart's current-month series below, one query for both. `everyday` is
    // the same sum without trip spending, for the `everyday` twins below.
    Transaction.aggregate<DaySums<string>>([
      ...rowsFor(rule, { userId, type: "expense", occurredAt: { $gte: start, $lt: next } }),
      { $group: { _id: { $dateToString: { date: "$occurredAt", format: "%Y-%m-%d", timezone: zone } }, total: { $sum: "$amount" }, everyday: { $sum: { $cond: [{ $gt: ["$tripId", null] }, 0, "$amount"] } } } }
    ]),
    Transaction.aggregate<DaySums<number>>([
      ...rowsFor(rule, { userId, type: "expense", occurredAt: { $gte: start, $lt: next } }),
      { $group: { _id: { $dayOfWeek: { date: "$occurredAt", timezone: zone } }, total: { $sum: "$amount" }, everyday: { $sum: { $cond: [{ $gt: ["$tripId", null] }, 0, "$amount"] } } } }
    ]),
    Transaction.findOne({ userId }).sort({ occurredAt: 1 }).select("occurredAt").lean()
  ]);

  // The active goal closest to its own pace-based finish, whether or not it has a
  // deadline — unlike the health score's goalsPillar, which only scores goals WITH one.
  let goalWatch: { goalName: string; monthsNeeded: number; projectedDate: string; saved: number; target: number } | null = null;
  let bestMonthsNeeded = Infinity;
  for (const goal of goals) {
    const { done, monthsNeeded } = goalPace(goal, now, zone);
    if (done || monthsNeeded === null) continue;
    if (monthsNeeded < bestMonthsNeeded) {
      bestMonthsNeeded = monthsNeeded;
      const projected = new Date(now);
      projected.setUTCMonth(projected.getUTCMonth() + monthsNeeded);
      goalWatch = {
        goalName: goal.name,
        monthsNeeded,
        projectedDate: projected.toISOString(),
        saved: goal.saved,
        target: goal.target
      };
    }
  }

  // Too little of the month has happened yet for "days without spending" to mean
  // anything — the same kind of floor budget_pace's own MIN_PACE_DAYS applies.
  const noSpendDaysOf = (pick: Pick): number | null =>
    daysElapsed >= 5 ? daysElapsed - expenseDays.filter((row) => pick(row) > 0).length : null;

  // Two full weeks is the floor for "you spend most on Fridays" to be a pattern
  // rather than one loud Tuesday.
  const weekdayHeatmapOf = (pick: Pick) => {
    if (daysElapsed < 14) return null;
    const totals = new Array(7).fill(0);
    for (const row of weekdayRows) totals[mondayFirst(row._id)] = pick(row);
    const max = Math.max(...totals, 0);
    return WEEKDAY_LABELS.map((day, i) => ({
      day,
      total: totals[i],
      intensity: max > 0 ? totals[i] / max : 0
    }));
  };

  // Complete prior months only, floored to actual history — same AVERAGE_MONTHS/
  // floor-to-available convention as the highlight engine's own multi-month average,
  // reused rather than a new local constant.
  const monthsAveraged = first
    ? Math.min(AVERAGE_MONTHS, Math.max(0, monthOrdinal(now, zone) - monthOrdinal(first.occurredAt, zone)))
    : 0;

  type Pace = { current: { date: string; amount: number }[]; average: { date: string; amount: number }[]; monthsAveraged: number };
  let paceOf = (_pick: Pick): Pace | null => null;

  if (monthsAveraged > 0) {
    const referenceMonthStarts: Date[] = [];
    for (let k = monthsAveraged; k >= 1; k--) {
      referenceMonthStarts.push(addMonthsInZone(start, zone, -k));
    }

    const referenceRows = await Transaction.aggregate<DaySums<number>>([
      ...rowsFor(rule, { userId, type: "expense", occurredAt: { $gte: referenceMonthStarts[0], $lt: start } }),
      { $group: { _id: { $dayOfMonth: { date: "$occurredAt", timezone: zone } }, total: { $sum: "$amount" }, everyday: { $sum: { $cond: [{ $gt: ["$tripId", null] }, 0, "$amount"] } } } }
    ]);
    const referenceMonths = referenceMonthStarts.map((s) => ({ daysInMonth: wholeDays(s, addMonthsInZone(s, zone, 1), zone) }));
    const daysInCurrentMonth = wholeDays(start, next, zone);

    paceOf = (pick) => {
      // The fiddly bit lives entirely in this pure function: each day-of-month index
      // divides only by however many reference months actually have that day.
      const averageAmounts = averageByDayOfMonth(new Map(referenceRows.map((r) => [r._id, pick(r)])), referenceMonths);
      const sumByDate = new Map(expenseDays.map((r) => [r._id, pick(r)]));
      const current = Array.from({ length: daysElapsed }, (_, i) => {
        const key = dayKey(addDaysInZone(start, zone, i), zone);
        return { date: key, amount: sumByDate.get(key) ?? 0 };
      });
      // `average` is allowed to run past `current` — that's the point of seeing where the
      // usual month ends up. Dated the same way `current` would be for the days they
      // overlap; beyond that there's no real calendar date to give it (a reference month
      // can run longer than this one, e.g. averaging in a 31-day month while this one is
      // February), so it's labelled by day-of-month instead of overflowing into next month.
      const average = averageAmounts.map((amount, i) => ({
        date: current[i]?.date ?? (i < daysInCurrentMonth ? dayKey(addDaysInZone(start, zone, i), zone) : `day-${i + 1}`),
        amount
      }));
      return { current, average, monthsAveraged };
    };
  }

  const all: Pick = (row) => row.total;
  const everyday: Pick = (row) => row.everyday;

  // `forYou` and `pace` count trip spending as in 2.8.1; `everyday` is the same three without
  // it (D21), for the app's "spending means everyday" rule.
  reply.ok(res, {
    forYou: { goalWatch, noSpendDays: noSpendDaysOf(all), weekdayHeatmap: weekdayHeatmapOf(all) },
    pace: paceOf(all),
    everyday: { noSpendDays: noSpendDaysOf(everyday), weekdayHeatmap: weekdayHeatmapOf(everyday), pace: paceOf(everyday) }
  }, "Dashboard insights fetched");
}