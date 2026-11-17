import type { ITransaction, Paginated } from "@save-n-spend/types";
import { useMemo } from "react";
import { get } from "@/lib/api";
import { useApiPages, useApiQuery } from "@/lib/query/useApiQuery";
import { buildQuery, feedFilters, summaryPath, type FeedParams } from "@/lib/transactionQuery";

export type { FeedParams, FeedType } from "@/lib/transactionQuery";

const PAGE_SIZE = 20;

const rangeKeyOf = (params: FeedParams): string => `${params.startDate ?? ""}|${params.endDate ?? ""}`;


export const useTransactions = () => {
  // Everyday rows only — a trip's are read on the trip.
  const { data, ...rest } = useApiQuery<Paginated<ITransaction>>("/transactions?trips=exclude");
  return { items: data?.items ?? [], ...rest };
};

// The Activity feed — server-filtered (date range / category / search) and
// paginated for infinite scroll. Filtering and paging both live server-side per
// the spec: a page can never be filtered or summed client-side.
export const useTransactionFeed = (params: FeedParams) => {
  const filters = feedFilters(params);
  // Every filter is in the key. A range change drops the rows, so the list falls back to its
  // skeleton rather than showing last week's transactions under "This Week"; a category or
  // search change keeps them until the new ones land, so typing doesn't strobe the list.
  const { total, ...rest } = useApiPages<ITransaction>(
    (page) => `/transactions${buildQuery({ page, limit: PAGE_SIZE, ...filters })}`,
    { keepPreviousWithin: rangeKeyOf(params) },
  );
  // How many rows this filter combination matches in total, not just what's loaded —
  // the filter sheet's "Show N results" reads this live as chips are tapped.
  return { ...rest, totalDocs: total };
};

// How many transactions are filed under a category — asked once, right before
// Manage categories confirms a delete, so the confirm can name the exact number
// of rows whose history the archive keeps intact. `limit=1` because only the
// count is wanted; the page itself is thrown away.
export const countTransactionsIn = async (categoryId: string): Promise<number> => {
  const res = await get<Paginated<ITransaction>>(
    `/transactions?category=${encodeURIComponent(categoryId)}&limit=1`
  );
  return res.total;
};

export type TransactionSummary = {
  income: number;
  expenses: number;
  savings: number;
  /** Trip spending in the range — what the everyday totals leave out. */
  tripExpenses?: number;
};

// The Activity card's totals, computed server-side over every row the list's filters match
// (all pages, not just the loaded ones). Queued offline rows are not counted until they sync.
// A range change clears the totals, so `data === null` is a reliable "these totals are not
// for the range on screen"; a filter change keeps them until the new ones land, as the list
// keeps its rows.
export const useTransactionSummary = (params: FeedParams) =>
  useApiQuery<TransactionSummary>(summaryPath(params), { keepPreviousWithin: rangeKeyOf(params) });


export type TripMatches = { count: number; tripIds: string[] };

// What a search turns up among trip expenses, which Activity's list leaves out — so a search for
// "AirBnB" can say where it went instead of looking like it found nothing. Same date range as the
// list; a failure just means no hint.
export const useTripMatches = (params: { search?: string; startDate?: string; endDate?: string }): TripMatches | null => {
  const term = params.search?.trim() ?? "";
  const path = term.length < 2
    ? null
    : `/transactions${buildQuery({ search: term, startDate: params.startDate, endDate: params.endDate, trips: "only", limit: 50 })}`;
  const { data, error } = useApiQuery<Paginated<ITransaction>>(path);
  return useMemo(() => {
    if (!path || error || !data || data.total === 0) return null;
    const tripIds = [...new Set(data.items.map((t) => t.tripId).filter((id): id is string => !!id))];
    return { count: data.total, tripIds };
  }, [path, error, data]);
};
