import type { InsightsCategorySlice, UncategorisedSpend } from "@save-n-spend/types";
import { TRIPS_CATEGORY_ID } from "@save-n-spend/types";
import { chartOthers, chartPalette, tripsColor } from "@/theme/charts";

// The 2.8.6 trips rule: the app reads every total with `trips=entries`, so a closed trip is one
// expense in the built-in Trips category on its close day, and every total, share and count
// already holds it. Nothing is added or taken out here; Trips is a category like the rest, with
// its own fixed colour so it reads the same on every screen.

export type SeriesInput = { income: number; expense: number };

/** Insights' hero, its change and the income-vs-expense columns, from the six-unit series (last
 *  point = the shown window). */
export const insightsSpend = (series: SeriesInput[]) => {
  const cur = series[series.length - 1];
  const prev = series[series.length - 2];
  const current = cur?.expense ?? 0;
  const previous = prev?.expense ?? 0;
  return {
    current,
    deltaPct: previous > 0 ? ((current - previous) / previous) * 100 : 0,
    columns: series.map((p) => ({ income: p.income, expense: p.expense })),
  };
};

export type ShareSlice = {
  id: string;
  name: string;
  total: number;
  /** Share of all spending, 0–100 to one decimal. */
  pct: number;
  color: string;
  children?: InsightsCategorySlice[];
};

export const OTHERS_ID = "others";
export const UNCATEGORISED_ID = "uncategorised";
export const isTrips = (id: string): boolean => id === TRIPS_CATEGORY_ID;

const tenth = (n: number): number => Math.round(n * 10) / 10;

/**
 * "By category" and the ring from the server's shares. Null on an older API (no `uncategorised`),
 * where the caller keeps `foldCategories`.
 *
 * - `list`: the top categories by size (Trips among them), then "Others" (the rest, its share the
 *   sum of theirs), then "Uncategorised" when there is any. The server rounds the shares
 *   together, so the list adds up to exactly 100.0.
 * - `ring`: the same, without Uncategorised, which is in no slice.
 */
export const categoryShares = (
  slices: InsightsCategorySlice[],
  uncategorised: UncategorisedSpend | undefined,
  top = 5,
): { list: ShareSlice[]; ring: ShareSlice[] } | null => {
  if (!uncategorised) return null;
  const ranked = slices.filter((s) => typeof s.share === "number");
  let colour = 0;
  const head: ShareSlice[] = ranked.slice(0, top).map((s) => ({
    id: s.categoryId,
    name: s.name ?? "Uncategorised",
    total: s.total,
    pct: s.share as number,
    color: isTrips(s.categoryId) ? tripsColor : chartPalette[colour++] ?? chartOthers,
    children: s.children,
  }));
  const tail = ranked.slice(top);
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
  return { list, ring: head };
};

export type ReviewInput = {
  categories: { categoryId: string; name: string; total: number; pct: number; share?: number }[];
  uncategorised?: UncategorisedSpend;
};

export type ReviewRow = { id: string; name: string; total: number; pct: number };

/** Month in review's "Where it went": each row's share of all spending (Trips ranked among
 *  them), then uncategorised spend when there is any. An older API sends only `pct`. */
export const reviewRows = (r: ReviewInput): ReviewRow[] => {
  const rows: ReviewRow[] = r.categories.map((c) => ({ id: c.categoryId, name: c.name, total: c.total, pct: typeof c.share === "number" ? c.share : c.pct }));
  if (r.uncategorised && r.uncategorised.total > 0) {
    rows.push({ id: UNCATEGORISED_ID, name: "Uncategorised", total: r.uncategorised.total, pct: r.uncategorised.share });
  }
  return rows;
};
