import { useCallback, useEffect, useState } from "react";
import type { HighlightHistoryPage, IHighlightLog } from "@save-n-spend/types";
import { get } from "./api";
import { useSession } from "@/store/session";

const PAGE_SIZE = 20;

/**
 * The permanent, paginated record — separate from `useHighlights()` (the live,
 * dismissible, capped-at-4 view): this one never shrinks, is never dismissed, and is
 * sorted newest-first straight from the server. Loaded a page at a time on request
 * rather than all at once, since it only grows over the life of the account.
 */
export const useHighlightHistory = () => {
  const [items, setItems] = useState<IHighlightLog[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalDocs, setTotalDocs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetPage: number, replace: boolean) => {
    if (useSession.getState().status !== "authed") return;
    replace ? setLoading(true) : setLoadingMore(true);
    setError(null);
    try {
      const res = await get<HighlightHistoryPage>(`/highlights/history?page=${targetPage}&limit=${PAGE_SIZE}`);
      setItems((prev) => (replace ? res.docs : [...prev, ...res.docs]));
      setPage(res.page);
      setHasMore(res.hasNextPage);
      setTotalDocs(res.totalDocs);
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
    finally {
      replace ? setLoading(false) : setLoadingMore(false);
    }
  }, []);

  const status = useSession((s) => s.status);
  useEffect(() => {
    if (status === "authed") load(1, true);
  }, [status, load]);

  const refetch = useCallback(() => load(1, true), [load]);
  const loadMore = useCallback(() => {
    if (!hasMore || loading || loadingMore) return;
    load(page + 1, false);
  }, [hasMore, loading, loadingMore, page, load]);

  return { items, totalDocs, loading, loadingMore, hasMore, error, refetch, loadMore };
};
