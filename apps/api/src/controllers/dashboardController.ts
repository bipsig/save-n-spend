import { Request, Response } from "express"
import { dashboardSummaryQuerySchema } from "../schemas/dashboardSchema"
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
import { computeCurrentStreak } from "../services/highlightSnapshotService";
import { netWorthTrend } from "../services/netWorthHistoryService";
import { averageByDayOfMonth } from "../services/paceMath";

export const getDashboardSummary = async (req: Request, res: Response): Promise<void> => {

  const { month, since } = dashboardSummaryQuerySchema.parse(req.query);
  const zone = await resolveZone(req);
  const now = new Date();
  const userId = new mongoose.Types.ObjectId(req.user!.userId);

  // Shared with GET /budgets rather than cut here: the dashboard's "this month" and a
  // budget's month are the same month by definition, and two implementations drift.
  const { start, next, label } = monthRange(zone, month);

  const weekStart = startOfWeekInZone(now, zone);
  const weekEnd = addDaysInZone(weekStart, zone, 7);

  // Sourced directly rather than through GET /highlights: that endpoint only surfaces
  // the streak when it clears the materiality-ranked, max-4 cap, so a real streak could
  // go silently missing on a busy day — wrong for a badge meant to always be visible.
  const [currentStreak, monthlySums, netWorth, weekSums, biggestExpense, sinceLastOpened, first] = await Promise.all([
    computeCurrentStreak(req.user!.userId, zone, now),
    Transaction.aggregate([
      {
        $match: {
          userId,
          type: { $in: ["income", "expense"] },
          occurredAt: { $gte: start, $lt: next }
        }
      },
      { $group: { _id: "$type", total: { $sum: "$amount" } } }
    ]),
    Account.aggregate([
      { $match: { userId, isArchived: false } },
      { $group: { _id: null, total: { $sum: "$balance" } } }
    ]),
    // This week, not this month — a tighter feedback loop than the monthly figures
    // above, which barely move day to day.
    Transaction.aggregate([
      {
        $match: {
          userId,
          type: { $in: ["income", "expense"] },
          occurredAt: { $gte: weekStart, $lt: weekEnd }
        }
      },
      { $group: { _id: "$type", total: { $sum: "$amount" } } }
    ]),
    // Symmetric with `monthlySums` above — same match, sorted and capped at one instead
    // of grouped, so the single expense that moved the month's number most can be named.
    Transaction.aggregate([
      { $match: { userId, type: "expense", occurredAt: { $gte: start, $lt: next } } },
      { $sort: { amount: -1 } },
      { $limit: 1 },
      { $project: { title: 1, amount: 1, occurredAt: 1 } }
    ]),
    since
      ? Transaction.aggregate([
        { $match: { userId, type: "expense", occurredAt: { $gte: new Date(since) } } },
        { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$amount" } } }
      ])
      : Promise.resolve(null),
    Transaction.findOne({ userId }).sort({ occurredAt: 1 }).select("occurredAt").lean()
  ]);

  const income = monthlySums.find((res) => res._id === "income")?.total ?? 0;
  const expenses = monthlySums.find((res) => res._id === "expense")?.total ?? 0;
  const weekIncome = weekSums.find((res) => res._id === "income")?.total ?? 0;
  const weekExpense = weekSums.find((res) => res._id === "expense")?.total ?? 0;
  const currentNetWorth = netWorth[0]?.total ?? 0;

  // A brand-new account with no transactions yet has no history to reconstruct — a
  // single "now" point, same as the service's own floor for a young one.
  const { points: trend, monthlyFlow } = first
    ? await netWorthTrend(req.user!.userId, zone, now, currentNetWorth, first.occurredAt)
    : { points: [{ label, total: currentNetWorth }], monthlyFlow: [] };

  // This month's own totals close out the same series — the service only knows about
  // complete PRIOR months, and this controller already has this month's from monthlySums.
  const flowTrend = [...monthlyFlow, { label, income, expense: expenses }];

  const response = {
    month: label,
    income,
    expenses,
    savings: income - expenses,
    netWorth: currentNetWorth,
    netWorthTrend: trend,
    flowTrend,
    currentStreak,
    weekIncome,
    weekExpense,
    biggestExpense: biggestExpense[0]
      ? { title: biggestExpense[0].title as string, amount: biggestExpense[0].amount as number, occurredAt: biggestExpense[0].occurredAt as Date }
      : null,
    sinceLastOpened: sinceLastOpened
      ? { transactions: sinceLastOpened[0]?.count ?? 0, spent: sinceLastOpened[0]?.total ?? 0 }
      : undefined
  };

  reply.ok(res, response, "Dashboard Summary Fetched successfully!");
}

/**
 * The financial health score. Takes no parameters on purpose — unlike the summary it is
 * always "as of now", measured over a trailing window rather than a named month, so
 * there is nothing for a caller to choose. See services/healthService.
 */
export const getHealthScore = async (req: Request, res: Response): Promise<void> => {
  const score = await healthScore(req.user!.userId, await resolveZone(req));

  reply.ok(res, score, "Health score fetched successfully!");
}

/** Consecutive-day-of-week Monday-first index (0=Mon .. 6=Sun) from Mongo's own
 *  Sunday-first `$dayOfWeek` (1=Sun .. 7=Sat) — matches the Monday-first convention
 *  `startOfWeekInZone`/the mobile app's own heatmap already use. */
const mondayFirst = (mongoDayOfWeek: number): number => (mongoDayOfWeek + 5) % 7;
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
  const now = new Date();
  const userId = new mongoose.Types.ObjectId(req.user!.userId);
  const { start, next } = monthRange(zone);
  const daysElapsed = partsInZone(now, zone).day;

  const [goals, expenseDays, weekdayRows, first] = await Promise.all([
    Goal.find({ userId }).select("name target saved createdAt").lean(),
    // Also carries `total` per day — feeds both the no-spend-day count (`.length`) and
    // the pace-vs-average chart's current-month series below, one query for both.
    Transaction.aggregate<{ _id: string; total: number }>([
      { $match: { userId, type: "expense", occurredAt: { $gte: start, $lt: next } } },
      { $group: { _id: { $dateToString: { date: "$occurredAt", format: "%Y-%m-%d", timezone: zone } }, total: { $sum: "$amount" } } }
    ]),
    Transaction.aggregate<{ _id: number; total: number }>([
      { $match: { userId, type: "expense", occurredAt: { $gte: start, $lt: next } } },
      { $group: { _id: { $dayOfWeek: { date: "$occurredAt", timezone: zone } }, total: { $sum: "$amount" } } }
    ]),
    Transaction.findOne({ userId }).sort({ occurredAt: 1 }).select("occurredAt").lean()
  ]);

  // The active goal closest to its own pace-based finish, whether or not it has a
  // deadline — unlike the health score's goalsPillar, which only scores goals WITH one.
  let goalWatch: { goalName: string; monthsNeeded: number; projectedDate: string; saved: number; target: number } | null = null;
  let bestMonthsNeeded = Infinity;
  for (const goal of goals) {
    if (goal.saved >= goal.target) continue;
    const monthsRunning = Math.max(1, monthOrdinal(now, zone) - monthOrdinal(goal.createdAt, zone));
    const rate = goal.saved / monthsRunning;
    if (rate <= 0) continue;
    const monthsNeeded = Math.ceil((goal.target - goal.saved) / rate);
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
  const noSpendDays = daysElapsed >= 5 ? daysElapsed - expenseDays.length : null;

  // Two full weeks is the floor for "you spend most on Fridays" to be a pattern
  // rather than one loud Tuesday.
  const weekdayHeatmap = daysElapsed >= 14
    ? (() => {
      const totals = new Array(7).fill(0);
      for (const row of weekdayRows) totals[mondayFirst(row._id)] = row.total;
      const max = Math.max(...totals, 0);
      return WEEKDAY_LABELS.map((day, i) => ({
        day,
        total: totals[i],
        intensity: max > 0 ? totals[i] / max : 0
      }));
    })()
    : null;

  // Complete prior months only, floored to actual history — same AVERAGE_MONTHS/
  // floor-to-available convention as the highlight engine's own multi-month average,
  // reused rather than a new local constant.
  const monthsAveraged = first
    ? Math.min(AVERAGE_MONTHS, Math.max(0, monthOrdinal(now, zone) - monthOrdinal(first.occurredAt, zone)))
    : 0;

  let pace: { current: { date: string; amount: number }[]; average: { date: string; amount: number }[]; monthsAveraged: number } | null = null;

  if (monthsAveraged > 0) {
    const referenceMonthStarts: Date[] = [];
    for (let k = monthsAveraged; k >= 1; k--) {
      referenceMonthStarts.push(addMonthsInZone(start, zone, -k));
    }

    const referenceRows = await Transaction.aggregate<{ _id: number; total: number }>([
      { $match: { userId, type: "expense", occurredAt: { $gte: referenceMonthStarts[0], $lt: start } } },
      { $group: { _id: { $dayOfMonth: { date: "$occurredAt", timezone: zone } }, total: { $sum: "$amount" } } }
    ]);
    const sumByDayOfMonth = new Map(referenceRows.map((r) => [r._id, r.total]));
    const referenceMonths = referenceMonthStarts.map((s) => ({ daysInMonth: wholeDays(s, addMonthsInZone(s, zone, 1), zone) }));
    // The fiddly bit lives entirely in this pure function: each day-of-month index
    // divides only by however many reference months actually have that day.
    const averageAmounts = averageByDayOfMonth(sumByDayOfMonth, referenceMonths);

    const sumByDate = new Map(expenseDays.map((r) => [r._id, r.total]));
    const current = Array.from({ length: daysElapsed }, (_, i) => {
      const key = dayKey(addDaysInZone(start, zone, i), zone);
      return { date: key, amount: sumByDate.get(key) ?? 0 };
    });
    // `average` is allowed to run past `current` — that's the point of seeing where the
    // usual month ends up. Dated the same way `current` would be for the days they
    // overlap; beyond that there's no real calendar date to give it (a reference month
    // can run longer than this one, e.g. averaging in a 31-day month while this one is
    // February), so it's labelled by day-of-month instead of overflowing into next month.
    const daysInCurrentMonth = wholeDays(start, next, zone);
    const average = averageAmounts.map((amount, i) => ({
      date: current[i]?.date ?? (i < daysInCurrentMonth ? dayKey(addDaysInZone(start, zone, i), zone) : `day-${i + 1}`),
      amount
    }));

    pace = { current, average, monthsAveraged };
  }

  reply.ok(res, {
    forYou: { goalWatch, noSpendDays, weekdayHeatmap },
    pace
  }, "Dashboard insights fetched");
}