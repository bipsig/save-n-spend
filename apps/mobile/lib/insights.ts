import type {
  InsightsSummary,
  InsightsPeriod,
  InsightsCategoryCompare,
  InsightsCategoryDetail,
  InsightsCategorySlice,
  InsightsAccountSlice,
  InsightsSeriesPoint,
  InsightsTrendPoint,
} from "@save-n-spend/types";
import { useCallback, useEffect, useState } from "react";
import { get } from "./api";
import { calendarFromKey } from "@/lib/zone";
import { useSession } from "@/store/session";
import { chartPalette, chartOthers } from "@/theme/charts";

export const useInsights = (period: InsightsPeriod, offset: number) => {
  const status = useSession((s) => s.status);
  const [data, setData] = useState<InsightsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (useSession.getState().status !== "authed") return;
    setLoading(true);
    setError(null);
    try {
      const res = await get<InsightsSummary>(`/insights?period=${period}&offset=${offset}`);
      setData(res);
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
    finally {
      setLoading(false);
    }
  }, [period, offset]);

  useEffect(() => {
    if (status === "authed") refetch();
  }, [status, refetch]);

  // Clear on period/offset change so the skeleton shows (not the prior window's
  // chart) while the new data loads — avoids a flash of mismatched data.
  useEffect(() => {
    setData(null);
    setLoading(true);
  }, [period, offset]);

  return { data, loading, error, refetch };
};

/**
 * One category over one window — the detail screen's own fetch.
 *
 * Its own request rather than a slice of the summary already in hand: the summary carries each
 * category's total and children but not its day-by-day trend, and a trend per category would
 * make the list endpoint's payload grow with the user's tree.
 */
export const useCategoryInsights = (categoryId: string, period: InsightsPeriod, offset: number) => {
  const status = useSession((s) => s.status);
  const [data, setData] = useState<InsightsCategoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (useSession.getState().status !== "authed" || !categoryId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await get<InsightsCategoryDetail>(
        `/insights/category/${encodeURIComponent(categoryId)}?period=${period}&offset=${offset}`,
      );
      setData(res);
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
    finally {
      setLoading(false);
    }
  }, [categoryId, period, offset]);

  useEffect(() => {
    if (status === "authed") refetch();
  }, [status, refetch]);

  useEffect(() => {
    setData(null);
    setLoading(true);
  }, [categoryId, period, offset]);

  return { data, loading, error, refetch };
};

// Client-side derivations (values-in-hand).

export type Slice = {
  id: string;
  name: string;
  total: number;
  pct: number;
  color: string;
  /** Sub-categories already counted in `total`. Absent on "Others" and on leaves. */
  children?: InsightsCategorySlice[];
};

// Top-N categories by share + a folded grey "Others"; colour assigned by rank.
export const foldCategories = (slices: InsightsCategorySlice[], top = 5): Slice[] => {
  const sum = slices.reduce((a, s) => a + s.total, 0) || 1;
  const out: Slice[] = slices.slice(0, top).map((s, i) => ({
    id: s.categoryId,
    name: s.name ?? "Uncategorised",
    total: s.total,
    pct: (s.total / sum) * 100,
    color: chartPalette[i] ?? chartOthers,
    children: s.children,
  }));
  const tail = slices.slice(top);
  if (tail.length) {
    const total = tail.reduce((a, s) => a + s.total, 0);
    out.push({ id: "others", name: "Others", total, pct: (total / sum) * 100, color: chartOthers });
  }
  return out;
};

export const accountShares = (slices: InsightsAccountSlice[]): Slice[] => {
  const sum = slices.reduce((a, s) => a + s.total, 0) || 1;
  return slices.map((s, i) => ({
    id: s.accountId,
    name: s.name ?? "Account",
    total: s.total,
    pct: (s.total / sum) * 100,
    color: chartPalette[i % chartPalette.length],
  }));
};

// Current vs previous unit (last two of the 6-unit series) → hero + KPI deltas.
export const seriesStats = (series: InsightsSeriesPoint[]) => {
  const cur = series[series.length - 1] ?? { income: 0, expense: 0, periodStart: "" };
  const prev = series[series.length - 2] ?? { income: 0, expense: 0, periodStart: "" };
  const rate = (p: { income: number; expense: number }) =>
    p.income > 0 ? ((p.income - p.expense) / p.income) * 100 : 0;
  return {
    currentExpense: cur.expense,
    spendDeltaPct: prev.expense > 0 ? ((cur.expense - prev.expense) / prev.expense) * 100 : 0,
    savingsRate: rate(cur),
    savingsRateDelta: rate(cur) - rate(prev),
  };
};

export const pctChange = (cur: number, prev: number) =>
  prev > 0 ? ((cur - prev) / prev) * 100 : 0;

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Everything the area chart needs from one pass over the server's buckets: the
// amounts, the sampled x-axis labels, and the full tooltip labels.
//
// The server sends the buckets dense, in order, and keyed by the calendar date it cut them on,
// so this is a plain map — the client never rebuilds the bucket list and the two halves have
// nothing to disagree about.
export const buildTrend = (points: InsightsTrendPoint[], period: InsightsPeriod) => {
  const days = points.map((p) => calendarFromKey(p.date));

  return {
    values: points.map((p) => p.amount),
    axis: days.map((d) =>
      period === "year"
        ? MONTH_ABBR[d.getUTCMonth()]
        : period === "week"
          ? WEEKDAYS[d.getUTCDay()]
          : `${d.getUTCDate()}`,
    ),
    tipLabels: days.map((d) =>
      period === "year"
        ? `${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCFullYear()}`
        : `${d.getUTCDate()} ${MONTH_ABBR[d.getUTCMonth()]}`,
    ),
  };
};

/**
 * Running totals over the buckets, in order — what "spent so far" means on a given day.
 *
 * A daily bar chart answers "was Tuesday expensive"; this answers "am I ahead of where I was",
 * which is the question a month with rent in it makes unanswerable from the bars alone.
 */
export const cumulative = (points: InsightsTrendPoint[]): number[] => {
  let running = 0;
  return points.map((p) => (running += p.amount));
};

export type CumulativePair = {
  current: number[];
  previous: number[];
  /** Bucket labels for the current series — the axis both are drawn against. */
  labels: string[];
  /** Where the two stand at the last bucket the current series reaches. */
  atCurrentEnd: { current: number; previous: number };
};

/**
 * The two running curves, aligned BY BUCKET INDEX rather than by date: bucket 3 of each is the
 * 4th day of its own period, so a 28-day February compares against a 31-day January and simply
 * runs out first.
 *
 * The previous curve is drawn in full even past where the current one stops — that period is
 * over, and seeing where it ended up is the point of the comparison.
 */
export const cumulativePair = (
  current: InsightsTrendPoint[],
  previous: InsightsTrendPoint[],
  period: InsightsPeriod,
): CumulativePair => {
  const cur = cumulative(current);
  const prev = cumulative(previous);
  const days = current.map((p) => calendarFromKey(p.date));

  return {
    current: cur,
    previous: prev,
    labels: days.map((d) =>
      period === "year" ? MONTH_ABBR[d.getUTCMonth()] : `${d.getUTCDate()}`,
    ),
    atCurrentEnd: {
      current: cur[cur.length - 1] ?? 0,
      // The same point in the previous period, not its final figure — comparing today's
      // running total against a whole finished month would call every month an improvement.
      previous: prev[Math.min(cur.length, prev.length) - 1] ?? 0,
    },
  };
};

export type HeatCell = {
  /** 'YYYY-MM-DD', the key the server cut the bucket on. */
  date: string;
  amount: number;
  /** 0 when nothing was spent, else the share of the heaviest day, 0–1. */
  intensity: number;
  dayOfMonth: number;
};

export type Heatmap = {
  /** Monday-first rows of 7. Leading and trailing nulls pad the first and last weeks. */
  weeks: (HeatCell | null)[][];
  busiest: HeatCell | null;
  /** Days with no spend at all — the number worth naming, not the tint. */
  clearDays: number;
};

/**
 * The window's day buckets as a calendar grid, each day tinted by what it cost.
 *
 * Only meaningful on day-bucketed trends (week and month); a year's buckets are months, and a
 * 12-cell "calendar" is just the trend line again. Callers gate on that.
 *
 * Intensity is a share of the heaviest day, not of the total: a month's spend spread over 30
 * days would leave every cell nearly colourless on an absolute scale.
 */
export const buildHeatmap = (points: InsightsTrendPoint[]): Heatmap => {
  const max = Math.max(...points.map((p) => p.amount), 0);

  const cells: HeatCell[] = points.map((p) => {
    const d = calendarFromKey(p.date);
    return {
      date: p.date,
      amount: p.amount,
      intensity: max > 0 ? p.amount / max : 0,
      dayOfMonth: d.getUTCDate(),
    };
  });

  // Monday-first, matching the week the rest of the app cuts. `getUTCDay` is Sunday-0, so
  // the shift is what puts Monday in the first column.
  const lead = points.length ? (calendarFromKey(points[0].date).getUTCDay() + 6) % 7 : 0;
  const padded: (HeatCell | null)[] = [...Array.from({ length: lead }, () => null), ...cells];
  while (padded.length % 7 !== 0) padded.push(null);

  const weeks: (HeatCell | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));

  return {
    weeks,
    busiest: cells.reduce<HeatCell | null>(
      (best, c) => (c.amount > 0 && (!best || c.amount > best.amount) ? c : best),
      null,
    ),
    clearDays: cells.filter((c) => c.amount === 0).length,
  };
};

export type CompareRow = {
  id: string;
  name: string;
  current: number;
  previous: number;
  /** Signed paise. Positive means more was spent this period. */
  delta: number;
  /** Signed percent, or null when there is nothing to divide by. */
  deltaPct: number | null;
  color: string;
};

/**
 * The biggest movers between the two windows, already ordered by the server. Trimmed here and
 * given a colour by rank, the same way the breakdown is.
 *
 * `deltaPct` is null rather than 0 when the previous figure was 0: a category spent on for the
 * first time has not risen by any percentage, and printing "+100%" would understate it as
 * badly as "+0%" would.
 */
export const compareRows = (rows: InsightsCategoryCompare[], top = 6): CompareRow[] =>
  rows.slice(0, top).map((r, i) => ({
    id: r.categoryId,
    name: r.name ?? "Uncategorised",
    current: r.current,
    previous: r.previous,
    delta: r.current - r.previous,
    deltaPct: r.previous > 0 ? ((r.current - r.previous) / r.previous) * 100 : null,
    color: chartPalette[i % chartPalette.length],
  }));
