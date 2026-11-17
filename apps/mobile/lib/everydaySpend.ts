import type {
  DashboardInsights,
  DashboardSummary,
  InsightsCategorySlice,
  InsightsTrendPoint,
  UncategorisedSpend,
} from "@save-n-spend/types";
import { chartOthers, chartPalette } from "@/theme/charts";

// D21 A+ (2.8.4): "Spent" or "Expenses" alone is everyday spending, trips left out, and a trip
// month gets one "Plus ₹X on trips" line. Shares are the server's, of everyday spending.
//
// Every 2.8.4 field may be missing (an API older than 2.8.4, or a response saved by one), so the
// inputs here take them as optional and each mapping falls back to exactly what 2.8.3 showed.

/** The trips line's amount, or null when there is no line: no trips, or the API didn't say. */
export const tripLine = (trips: number | undefined | null): number | null =>
  typeof trips === "number" && trips > 0 ? trips : null;

const everyday = (all: number, trips: number | undefined | null): number => all - (trips ?? 0);

export type HomeSpendInput = {
  expenses: number;
  tripExpenses?: number;
  weekExpense: number;
  weekTripExpense?: number;
  flowTrend: { expense: number; tripExpense?: number }[];
};

/** Home's Expenses tile, its sparkline and the week pulse's "Spent". */
export const homeSpend = (s: HomeSpendInput) => ({
  expenses: everyday(s.expenses, s.tripExpenses),
  trips: tripLine(s.tripExpenses),
  trend: s.flowTrend.map((p) => everyday(p.expense, p.tripExpense)),
  weekExpense: everyday(s.weekExpense, s.weekTripExpense),
});

export type SeriesInput = { income: number; expense: number; tripExpense?: number };

/**
 * Insights' hero, its change and the income-vs-expense columns, from the six-unit series (last
 * point = the shown window). Savings rate is not here: it counts trips (Q1), so it stays on
 * `seriesStats`.
 */
export const insightsSpend = (series: SeriesInput[]) => {
  const cur = series[series.length - 1];
  const prev = series[series.length - 2];
  const current = cur ? everyday(cur.expense, cur.tripExpense) : 0;
  const previous = prev ? everyday(prev.expense, prev.tripExpense) : 0;
  const trips = tripLine(cur?.tripExpense);
  return {
    current,
    deltaPct: previous > 0 ? ((current - previous) / previous) * 100 : 0,
    trips,
    /** Everything spent in the window, trips included: the ring's centre in a trip window. */
    withTrips: trips !== null && cur ? cur.expense : null,
    columns: series.map((p) => ({ income: p.income, expense: everyday(p.expense, p.tripExpense) })),
  };
};

export type ShareSlice = {
  id: string;
  name: string;
  total: number;
  /** Share of everyday spending, 0–100. Null on the Trips slice, which has none. */
  pct: number | null;
  color: string;
  children?: InsightsCategorySlice[];
};

export const OTHERS_ID = "others";
export const UNCATEGORISED_ID = "uncategorised";

const tenth = (n: number): number => Math.round(n * 10) / 10;

/**
 * "By category" and the ring from the server's shares. Null on an older API (no `uncategorised`),
 * where the caller keeps `foldCategories`.
 *
 * - `list`: the top everyday categories, then "Others" (the rest, its share the sum of theirs),
 *   then "Uncategorised" when there is any. The server rounds the shares together, so the list
 *   adds up to exactly 100.0. Trips isn't in it: it has no share of everyday spending.
 * - `ring`: the same categories and Others, then the Trips slice in grey. Uncategorised spend is
 *   in no slice, as before.
 */
export const categoryShares = (
  slices: InsightsCategorySlice[],
  uncategorised: UncategorisedSpend | undefined,
  top = 5,
): { list: ShareSlice[]; ring: ShareSlice[] } | null => {
  if (!uncategorised) return null;
  // The server sends a share on every slice but Trips.
  const daily = slices.filter((s) => typeof s.share === "number");
  const trips = slices.filter((s) => typeof s.share !== "number");

  const head: ShareSlice[] = daily.slice(0, top).map((s, i) => ({
    id: s.categoryId,
    name: s.name ?? "Uncategorised",
    total: s.total,
    pct: s.share as number,
    color: chartPalette[i] ?? chartOthers,
    children: s.children,
  }));
  const tail = daily.slice(top);
  if (tail.length) {
    head.push({
      id: OTHERS_ID,
      name: "Others",
      total: tail.reduce((a, s) => a + s.total, 0),
      pct: tenth(tail.reduce((a, s) => a + (s.share as number), 0)),
      color: chartOthers,
    });
  }

  const list = uncategorised.total > 0
    ? [...head, { id: UNCATEGORISED_ID, name: "Uncategorised", total: uncategorised.total, pct: uncategorised.share, color: chartOthers }]
    : head;
  const ring = [
    ...head,
    ...trips.map((s) => ({ id: s.categoryId, name: s.name, total: s.total, pct: null, color: chartOthers, children: s.children })),
  ];
  return { list, ring };
};

export type ReviewInput = {
  expenses: number;
  tripExpenses?: number;
  previousExpenses: number;
  previousTripExpenses?: number;
  categories: { categoryId: string; name: string; total: number; pct: number; share?: number }[];
  uncategorised?: UncategorisedSpend;
};

export type ReviewRow = { id: string; name: string; total: number; pct: number | null };

/**
 * Month in review: the Expenses tile and its change (everyday against everyday), the trips line,
 * and "Where it went". On a 2.8.4 API each row's figure is its share of everyday spending, the
 * Trips row has none (it shows its amount), and uncategorised spend gets a row. On an older API
 * the rows keep the whole-number `pct` they always had.
 */
export const reviewSpend = (r: ReviewInput) => {
  const rows: ReviewRow[] = r.uncategorised
    ? r.categories.map((c) => ({ id: c.categoryId, name: c.name, total: c.total, pct: typeof c.share === "number" ? c.share : null }))
    : r.categories.map((c) => ({ id: c.categoryId, name: c.name, total: c.total, pct: c.pct }));
  if (r.uncategorised && r.uncategorised.total > 0) {
    rows.push({ id: UNCATEGORISED_ID, name: "Uncategorised", total: r.uncategorised.total, pct: r.uncategorised.share });
  }
  return {
    expenses: everyday(r.expenses, r.tripExpenses),
    previousExpenses: everyday(r.previousExpenses, r.previousTripExpenses),
    trips: tripLine(r.tripExpenses),
    rows,
  };
};

/** Category insights: its share of everyday spending, or of all spending on an older API. */
export const categoryShare = (d: { shareOfSpend: number; shareOfEverydaySpend?: number }) =>
  typeof d.shareOfEverydaySpend === "number"
    ? { pct: d.shareOfEverydaySpend, of: "everyday spending" }
    : { pct: d.shareOfSpend, of: "all spending" };

type Biggest = DashboardSummary["biggestExpense"];

/** Home's biggest expense: the everyday one. An older API sends only `biggestExpense`. A null
 *  `biggestEverydayExpense` (a month of trip spending only) stays null. */
export const biggestEveryday = (s: { biggestExpense: Biggest; biggestEverydayExpense?: Biggest }): Biggest =>
  s.biggestEverydayExpense !== undefined ? s.biggestEverydayExpense : s.biggestExpense;

/** "Since you last opened": everyday spent, and the trip part for its own line. */
export const sinceSpend = (s: { spent: number; tripSpent?: number }) => ({
  spent: everyday(s.spent, s.tripSpent),
  trips: tripLine(s.tripSpent),
});

type DashboardEveryday = DashboardInsights["everyday"];

/** No-spend days, weekday heatmap and pace on everyday spending. Each keeps the server's own
 *  null (too early to say); only a response without the `everyday` block falls back. */
export const dashboardEveryday = (d: Omit<DashboardInsights, "everyday"> & { everyday?: DashboardEveryday }): DashboardEveryday =>
  d.everyday ?? { noSpendDays: d.forYou.noSpendDays, weekdayHeatmap: d.forYou.weekdayHeatmap, pace: d.pace };

/** Insights' trend buckets with the trip part taken out. Without `tripAmount`, as sent. */
export const everydayTrend = (points: InsightsTrendPoint[]): InsightsTrendPoint[] =>
  points.map((p) => ({ date: p.date, amount: everyday(p.amount, p.tripAmount) }));

/** Insights' daily averages (the KPI tile and the projection), everyday when sent. */
export const dailyAverages = (d: {
  avgDailySpendCurrent: number;
  avgDailySpendPrevious: number;
  avgDailyEverydaySpendCurrent?: number;
  avgDailyEverydaySpendPrevious?: number;
}) => ({
  current: d.avgDailyEverydaySpendCurrent ?? d.avgDailySpendCurrent,
  previous: d.avgDailyEverydaySpendPrevious ?? d.avgDailySpendPrevious,
});
