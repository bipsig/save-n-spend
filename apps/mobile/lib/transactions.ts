import type { ITransaction } from "@save-n-spend/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { get } from "@/lib/api";
import { useSession } from "@/store/session";

interface Paginated<T> {
  docs: T[]
  page: number
  hasNextPage: boolean
  totalDocs: number
};

const PAGE_SIZE = 20;

const buildQuery = (params: Record<string, string | number | undefined>): string => {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join("&");
  return query ? `?${query}` : "";
};

export const useTransactions = () => {
  const status = useSession((s) => s.status);
  const [items, setItems] = useState<ITransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  const refetch = useCallback(async () => {
    if (useSession.getState().status !== "authed") return;
    setLoading(true);
    setError(null);
    try {
      const res = await get<Paginated<ITransaction>>("/transactions");
      setItems(res.docs);
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
    finally {
      setLoading(false);
    }
  }, []);


  useEffect(() => {
    if (status === "authed") refetch();
  }, [status, refetch]);

  return { items, loading, error, refetch };
}

/** The three kinds a reader can ask for. Balance corrections are never one of them —
 *  the server leaves them out of Activity entirely (see `filterTransactions`). */
export type FeedType = "income" | "expense" | "transfer";

export type FeedParams = {
  startDate?: string;
  endDate?: string;
  category?: string;
  type?: FeedType;
  search?: string;
};

// The Activity feed — server-filtered (date range / category / search) and
// paginated for infinite scroll. Filtering and paging both live server-side per
// the spec: a page can never be filtered or summed client-side.
export const useTransactionFeed = (params: FeedParams) => {
  const status = useSession((s) => s.status);
  const [items, setItems] = useState<ITransaction[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A monotonic id so a slow response from a stale filter can't clobber a newer one.
  const reqId = useRef(0);
  // Serialize the filter so the load callback is stable while values are unchanged.
  const key = `${params.startDate ?? ""}|${params.endDate ?? ""}|${params.category ?? ""}|${params.type ?? ""}|${params.search ?? ""}`;

  const load = useCallback(async (targetPage: number, replace: boolean) => {
    if (useSession.getState().status !== "authed") return;
    const myId = ++reqId.current;
    replace ? setLoading(true) : setLoadingMore(true);
    setError(null);
    try {
      const query = buildQuery({
        page: targetPage,
        limit: PAGE_SIZE,
        startDate: params.startDate,
        endDate: params.endDate,
        category: params.category,
        type: params.type,
        search: params.search,
      });
      const res = await get<Paginated<ITransaction>>(`/transactions${query}`);
      if (myId !== reqId.current) return; // superseded by a newer request
      setItems((prev) => (replace ? res.docs : [...prev, ...res.docs]));
      setPage(res.page);
      setHasMore(res.hasNextPage);
    }
    catch (err) {
      if (myId !== reqId.current) return;
      setError(err instanceof Error ? err.message : "Failed to load");
    }
    finally {
      if (myId === reqId.current) replace ? setLoading(false) : setLoadingMore(false);
    }
    // key captures every param that shapes the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (status === "authed") load(1, true);
  }, [status, load]);

  // Drop the rows when the RANGE changes, so the list falls back to its skeleton rather than
  // showing last week's transactions under a card labelled "This Week" — the summary above is
  // computed server-side for the new range and arrives separately.
  //
  // Only the range, not `key`: category and search are refinements the user can see they just
  // made, and clearing on every debounced keystroke would strobe the list while they typed.
  const rangeKey = `${params.startDate ?? ""}|${params.endDate ?? ""}`;
  useEffect(() => {
    setItems([]);
    setLoading(true);
  }, [rangeKey]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading || loadingMore) return;
    load(page + 1, false);
  }, [hasMore, loading, loadingMore, page, load]);

  const refetch = useCallback(() => load(1, true), [load]);

  return { items, loading, loadingMore, error, hasMore, loadMore, refetch };
};

// How many transactions are filed under a category — asked once, right before
// Manage categories confirms a delete, so the confirm can name the exact number
// of rows whose history the archive keeps intact. `limit=1` because only the
// count is wanted; the page itself is thrown away.
export const countTransactionsIn = async (categoryId: string): Promise<number> => {
  const res = await get<Paginated<ITransaction>>(
    `/transactions?category=${encodeURIComponent(categoryId)}&limit=1`
  );
  return res.totalDocs;
};

export type TransactionSummary = { income: number; expenses: number; savings: number };

// The range summary aggregate that drives the Activity card — computed server-side
// over the whole range, independent of the visible page or category/search filters.
export const useTransactionSummary = (params: { startDate?: string; endDate?: string }) => {
  const status = useSession((s) => s.status);
  const [data, setData] = useState<TransactionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const key = `${params.startDate ?? ""}|${params.endDate ?? ""}`;

  const refetch = useCallback(async () => {
    if (useSession.getState().status !== "authed") return;
    setLoading(true);
    setError(null);
    try {
      const query = buildQuery({ startDate: params.startDate, endDate: params.endDate });
      const res = await get<TransactionSummary>(`/transactions/summary${query}`);
      setData(res);
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
    finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (status === "authed") refetch();
  }, [status, refetch]);

  // Clear on a range change, so `data === null` is a reliable "these totals are not for
  // the range currently on screen". Holding the old ones was worse than showing nothing:
  // the label said "This Week" while the figures were still last week's, and the reader
  // had no way to tell.
  useEffect(() => {
    setData(null);
    setLoading(true);
  }, [key]);

  return { data, loading, error, refetch };
};

