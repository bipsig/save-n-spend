import { useMemo } from "react";
import type { ITitleSuggestion } from "@save-n-spend/types";
import { useTitleSuggestionStore } from "@/store/titleSuggestions";

// Client-side derivation over the store's raw list (already fetched once, see
// store/titleSuggestions.ts) — the same "load once, filter locally" split as
// lib/insights.ts's pure helpers over an already-fetched summary.

export type TitleMatch = {
  title: string;
  category: string | null;
  count: number;
};

/** How many chips the add-transaction form shows at once — enough to be useful, not so
 *  many the row reads as a wall rather than a shortcut. */
const CHIP_LIMIT = 8;

/**
 * The same title logged under different categories over time (a rename, a mistake, two
 * genuinely different "Uber" trips) rolls up into one suggestion here — its count summed
 * across every category it's appeared under, its own `category` taken from whichever one
 * it was filed under most, so the list reads as "what you call this" rather than one row
 * per category it happened to land in.
 */
const rollUpAcrossCategories = (pool: ITitleSuggestion[]): TitleMatch[] => {
  const byKey = new Map<string, { title: string; category: string | null; count: number; topCount: number }>();

  for (const s of pool) {
    const key = s.title.trim().toLowerCase();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { title: s.title, category: s.category, count: s.count, topCount: s.count });
      continue;
    }
    existing.count += s.count;
    if (s.count > existing.topCount) {
      existing.topCount = s.count;
      existing.category = s.category;
    }
  }

  return [...byKey.values()]
    .map(({ title, category, count }) => ({ title, category, count }))
    .sort((a, b) => b.count - a.count);
};

/**
 * The chips to show under the Title field right now.
 *
 * Ranked by how often this account has used a title, scoped to the transaction's own type
 * (an expense's history is a different vocabulary from an income's), and to one category
 * once the user has picked one — the exact behaviour asked for: choose a category, and
 * only that category's titles come up. With no category picked yet, every title across
 * every category is on the table, rolled up per title (see above).
 *
 * Narrowed further by whatever's already typed, and never offers back exactly what's
 * already in the field — a chip that just repeats the input isn't a suggestion.
 */
export const useTitleMatches = (
  type: "expense" | "income",
  categoryId: string,
  query: string,
): TitleMatch[] => {
  const list = useTitleSuggestionStore((s) => s.list);

  return useMemo(() => {
    const pool = list.filter((s) => s.type === type);
    // Filtering a list already sorted by count preserves that order, so only the
    // no-category rollup — which changes the ranking by summing across categories —
    // needs its own sort.
    const ranked = categoryId ? pool.filter((s) => s.category === categoryId) : rollUpAcrossCategories(pool);

    const needle = query.trim().toLowerCase();
    const matches = needle
      ? ranked.filter((s) => {
        const title = s.title.toLowerCase();
        return title !== needle && title.includes(needle);
      })
      : ranked;

    return matches.slice(0, CHIP_LIMIT);
  }, [list, type, categoryId, query]);
};
