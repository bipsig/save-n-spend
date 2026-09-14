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
import { appZone, calendarDate, calendarDaysBetween, calendarFromKey, calendarToday } from "@/lib/zone";
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

// A day period's trend is keyed "YYYY-MM-DDTHH" (see the API's getTrend), not a plain
// calendar key — `calendarFromKey` can't parse the hour suffix, so this reads it directly
// rather than routing through that parser.
//
// `useInsights` clears `data` in a SEPARATE effect from the one that fetches it, so
// switching to the Day tab has one render where `period` has already flipped but `data`
// still holds the previous period's day-keyed trend (10 characters, no "T"). Slicing past
// the end of a short string returns "", and `Number("")` is 0 — not NaN — so every stale
// point would silently collapse onto hour 0 and collide. Filtering to real hour keys first
// is what keeps that one frame from rendering a strip of duplicate cells.
const isHourKey = (key: string): boolean => key.length === 13 && key[10] === "T";
const hourOfKey = (key: string): number => Number(key.slice(11, 13));

/** "12a"/"3p"/"11p" — compact enough to carry as a chart axis tick, unlike a full time. */
export const hourAbbr = (hour: number): string =>
  hour === 0 ? "12a" : hour < 12 ? `${hour}a` : hour === 12 ? "12p" : `${hour - 12}p`;

/** "12 AM"/"3 PM" — the fuller form, for a tooltip rather than an axis. */
export const hourFull = (hour: number): string =>
  hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`;

// Everything the area chart needs from one pass over the server's buckets: the
// amounts, the sampled x-axis labels, and the full tooltip labels.
//
// The server sends the buckets dense, in order, and keyed by the calendar date it cut them on,
// so this is a plain map — the client never rebuilds the bucket list and the two halves have
// nothing to disagree about.
export const buildTrend = (points: InsightsTrendPoint[], period: InsightsPeriod) => {
  if (period === "day") {
    // See isHourKey above — drops a frame of stale, differently-shaped data rather than
    // mis-reading it as hour 0.
    points = points.filter((p) => isHourKey(p.date));
    return {
      values: points.map((p) => p.amount),
      axis: points.map((p) => hourAbbr(hourOfKey(p.date))),
      tipLabels: points.map((p) => hourFull(hourOfKey(p.date))),
    };
  }

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
  const labels = period === "day"
    // See isHourKey — a frame of stale, differently-shaped data reads as no label at all
    // rather than as hour 0 for every point.
    ? current.map((p) => (isHourKey(p.date) ? hourAbbr(hourOfKey(p.date)) : ""))
    : current.map((p) => {
      const d = calendarFromKey(p.date);
      return period === "year" ? MONTH_ABBR[d.getUTCMonth()] : `${d.getUTCDate()}`;
    });

  return {
    current: cur,
    previous: prev,
    labels,
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

export type HourCell = {
  /** 0–23, zone-local. */
  hour: number;
  amount: number;
  /** 0 when nothing was spent, else the share of the heaviest hour, 0–1. */
  intensity: number;
};

export type HourlyPattern = {
  /** However many hours have elapsed today — no padding into hours that haven't happened
   *  yet, the same way a mid-month heatmap doesn't pad blanks for the rest of the month. */
  cells: HourCell[];
  busiest: HourCell | null;
  clearHours: number;
};

/**
 * Today's hour buckets as a flat strip, each tinted by what it cost — the Day period's
 * analog of `buildHeatmap`, using the exact same "share of the heaviest bucket" intensity
 * math. Flat rather than a calendar grid: an hour-of-day has no week to align to, so none of
 * `buildHeatmap`'s Monday-first padding applies here.
 */
export const buildHourlyPattern = (points: InsightsTrendPoint[]): HourlyPattern => {
  // See isHourKey above — one render frame of the previous period's differently-shaped
  // trend would otherwise read as 24 copies of hour 0 and collide as React keys.
  points = points.filter((p) => isHourKey(p.date));
  const max = Math.max(...points.map((p) => p.amount), 0);

  const cells: HourCell[] = points.map((p) => ({
    hour: hourOfKey(p.date),
    amount: p.amount,
    intensity: max > 0 ? p.amount / max : 0,
  }));

  return {
    cells,
    busiest: cells.reduce<HourCell | null>(
      (best, c) => (c.amount > 0 && (!best || c.amount > best.amount) ? c : best),
      null,
    ),
    clearHours: cells.filter((c) => c.amount === 0).length,
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

export type Projection = {
  /** Paise. Where the period's spend is headed if today's daily pace holds to the end. */
  total: number;
  /** Including today. */
  daysRemaining: number;
};

/**
 * Extrapolates `avgDailySpendCurrent` — already "spent so far ÷ days elapsed", see the
 * API's getAverageSpend — across however many days the whole period actually has, from a
 * 28-day February to a 366-day leap year. Works for any period (week/month/year) because
 * it never assumes a length; `periodStart`/`periodEnd` already say exactly what it is.
 *
 * Meaningless for a period that has already finished: `avgDailySpendCurrent` there is the
 * true average over the FULL period already (see the API), so this would just recover the
 * known total rather than project anything. Callers only show it for the window in
 * progress (offset 0) — `daysRemaining` reaching 0 is the same signal, for a caller that
 * would rather check the number than track its own offset.
 */
export const projectPeriod = (
  avgDailySpendCurrent: number,
  periodStart: string,
  periodEnd: string,
  zone: string,
): Projection => {
  const start = calendarDate(new Date(periodStart), zone);
  const end = calendarDate(new Date(periodEnd), zone); // exclusive, so this IS the day count
  const totalDays = Math.max(calendarDaysBetween(start, end), 1);
  const daysRemaining = Math.max(calendarDaysBetween(calendarToday(zone), end), 0);

  return { total: Math.round(avgDailySpendCurrent * totalDays), daysRemaining };
};

export type DayProjection = {
  /** Paise. Where today's spend is headed if the pace so far holds for the rest of it. */
  total: number;
  /** Including the current hour. */
  hoursRemaining: number;
  /** Paise/hour — the Day period's analog of `avgDailySpendCurrent`, computed here rather
   *  than read from the API: that field divides by whole days elapsed, which is always
   *  exactly 1 for a window this short (see getAverageSpend), so it would just recover
   *  today's own total rather than a genuine rate. */
  avgPerHour: number;
};

/**
 * The Day-tab analog of `projectPeriod`, built entirely from the hour-bucketed trend
 * already fetched for the chart above it — no new API field needed.
 */
export const projectDay = (trend: InsightsTrendPoint[]): DayProjection => {
  // See isHourKey above — without this, one render frame of the previous period's
  // differently-shaped trend would flash a projection computed from day totals as if
  // they were hours.
  trend = trend.filter((p) => isHourKey(p.date));
  const hoursElapsed = Math.max(trend.length, 1);
  const totalSoFar = trend.reduce((sum, p) => sum + p.amount, 0);
  const avgPerHour = Math.round(totalSoFar / hoursElapsed);

  return { total: avgPerHour * 24, hoursRemaining: Math.max(24 - trend.length, 0), avgPerHour };
};

// Window labels — shared by the screen and the PDF export, so the two can never disagree
// about what "This Month" or "vs Aug" means.

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Anchored on today WHERE THE USER IS, then plain `Date.UTC` arithmetic on that calendar
// date — anchoring on `new Date()` and reading `getUTC*` off it names the wrong window for
// a third of every Indian day: past 5:30am IST the UTC date is still yesterday, so on the
// 1st "This Month" would label the previous one.
const anchor = (): Date => calendarToday(appZone());

// Monday-start of the week that is `offset` weeks from the current one.
const weekStart = (offset: number): Date => {
  const now = anchor();
  const sinceMonday = (now.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - sinceMonday + offset * 7));
};

// The human label for the window the navigator points at. Current/previous read
// friendly ("This Month" / "Last Month"); anything older is concrete.
export const windowLabel = (period: InsightsPeriod, offset: number): string => {
  if (offset === 0) return period === "day" ? "Today" : period === "week" ? "This Week" : period === "month" ? "This Month" : "This Year";
  if (offset === -1) return period === "day" ? "Yesterday" : period === "week" ? "Last Week" : period === "month" ? "Last Month" : "Last Year";

  const now = anchor();
  if (period === "year") return `${now.getUTCFullYear() + offset}`;
  if (period === "month") {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    return `${MONTHS_FULL[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  if (period === "day") {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
    return `${d.getUTCDate()} ${MONTH_ABBR[d.getUTCMonth()]}`;
  }
  const start = weekStart(offset);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 6));
  return start.getUTCMonth() === end.getUTCMonth()
    ? `${start.getUTCDate()}–${end.getUTCDate()} ${MONTH_ABBR[end.getUTCMonth()]}`
    : `${start.getUTCDate()} ${MONTH_ABBR[start.getUTCMonth()]} – ${end.getUTCDate()} ${MONTH_ABBR[end.getUTCMonth()]}`;
};

// Short label for the unit just before the shown window (delta "vs …").
export const prevLabel = (period: InsightsPeriod, offset: number): string => {
  const now = anchor();
  if (period === "year") return `${now.getUTCFullYear() + offset - 1}`;
  if (period === "week") return "prev wk";
  if (period === "day") return "yesterday";
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset - 1, 1));
  return MONTH_ABBR[d.getUTCMonth()];
};

// `periodStart` is a bare calendar key ("2026-08-01") the server already cut in the user's
// zone, so it is read field-by-field and never re-read as a moment. Never an hour key —
// this labels the 6-unit income-vs-expense series, whose units are whole days even when
// `period` is "day" (see the API's getIncomeVsExpense), so `calendarFromKey` parses it fine.
export const seriesLabel = (key: string, period: InsightsPeriod): string => {
  const d = calendarFromKey(key);
  if (period === "year") return `${d.getUTCFullYear()}`;
  if (period === "month") return MONTH_ABBR[d.getUTCMonth()];
  if (period === "day") return WEEKDAYS[d.getUTCDay()];
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`; // week
};
