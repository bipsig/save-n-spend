/** The three kinds a reader can ask for. Balance corrections are never one of them —
 *  the server leaves them out of Activity entirely (see `filterTransactions`). */
export type FeedType = "income" | "expense" | "transfer";

export type FeedParams = {
  startDate?: string;
  endDate?: string;
  /** Multi-select — joined into one comma-separated query param; the server expands
   *  each selected category to include its own children. */
  category?: string[];
  /** Multi-select — matches a transaction whose `account` OR `toAccount` is any of these. */
  account?: string[];
  type?: FeedType;
  search?: string;
};

export const buildQuery = (params: Record<string, string | number | undefined>): string => {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join("&");
  return query ? `?${query}` : "";
};

/** Activity's filters as query params, shared by the list and its summary card so the card
 *  is always asked about exactly the rows beneath it. */
export const feedFilters = (params: FeedParams): Record<string, string | undefined> => ({
  startDate: params.startDate,
  endDate: params.endDate,
  category: params.category?.length ? params.category.join(",") : undefined,
  account: params.account?.length ? params.account.join(",") : undefined,
  type: params.type,
  search: params.search,
  // Everyday rows and one row per closed trip on its close day, never a trip's own rows.
  trips: "entries",
});

/** The summary card's request. The path is also its offline-cache key (lib/api.ts), so each
 *  filter combination keeps its own last-known totals. */
export const summaryPath = (params: FeedParams): string => `/transactions/summary${buildQuery(feedFilters(params))}`;
