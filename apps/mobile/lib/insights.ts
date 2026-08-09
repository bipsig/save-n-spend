import type {
  InsightsSummary,
  InsightsPeriod,
  InsightsCategorySlice,
  InsightsAccountSlice,
  InsightsSeriesPoint,
  InsightsTrendPoint,
} from "@save-n-spend/types";
import { useCallback, useEffect, useState } from "react";
import { get } from "./api";
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

// ---- client-side derivations (values-in-hand) -------------------------------

export type Slice = { id: string; name: string; total: number; pct: number; color: string };

// Top-N categories by share + a folded grey "Others"; colour assigned by rank.
export const foldCategories = (slices: InsightsCategorySlice[], top = 5): Slice[] => {
  const sum = slices.reduce((a, s) => a + s.total, 0) || 1;
  const out: Slice[] = slices.slice(0, top).map((s, i) => ({
    id: s.categoryId,
    name: s.name ?? "Uncategorised",
    total: s.total,
    pct: (s.total / sum) * 100,
    color: chartPalette[i] ?? chartOthers,
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

const utcMidnight = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

// The dense list of trend buckets for a window: one per day (week/month) or per
// month (year), from periodStart up to periodEnd — but never past today, so a
// still-running window (e.g. the current month) stops at today instead of
// trailing a long zero tail into the future.
const windowBuckets = (period: InsightsPeriod, startISO: string, endISO: string): Date[] => {
  const start = new Date(startISO);
  const rawEnd = new Date(endISO);
  const now = new Date();
  const cap = utcMidnight(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const end = rawEnd < cap ? rawEnd : cap;

  const out: Date[] = [];
  if (period === "year") {
    let d = utcMidnight(start.getUTCFullYear(), start.getUTCMonth(), 1);
    while (d < end) {
      out.push(d);
      d = utcMidnight(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    }
    return out;
  }

  let d = utcMidnight(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  while (d < end) {
    out.push(d);
    d = utcMidnight(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  }
  return out;
};

// Everything the area chart needs, aligned to one bucket list: the zero-filled
// amounts, sampled x-axis labels, and full tooltip labels. Windowed by the
// server's periodStart/periodEnd so past periods render their own days.
export const buildTrend = (
  points: InsightsTrendPoint[],
  period: InsightsPeriod,
  periodStart: string,
  periodEnd: string,
) => {
  const buckets = windowBuckets(period, periodStart, periodEnd);
  const byTime = new Map<number, number>();
  for (const p of points) byTime.set(new Date(p.date).getTime(), p.amount);

  return {
    values: buckets.map((d) => byTime.get(d.getTime()) ?? 0),
    axis: buckets.map((d) =>
      period === "year"
        ? MONTH_ABBR[d.getUTCMonth()]
        : period === "week"
          ? WEEKDAYS[d.getUTCDay()]
          : `${d.getUTCDate()}`,
    ),
    tipLabels: buckets.map((d) =>
      period === "year"
        ? `${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCFullYear()}`
        : `${d.getUTCDate()} ${MONTH_ABBR[d.getUTCMonth()]}`,
    ),
  };
};
