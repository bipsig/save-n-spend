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

// Client-side derivations (values-in-hand).

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
