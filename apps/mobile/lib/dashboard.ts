import type { DashboardInsights, DashboardSummary } from "@save-n-spend/types"
import { useCallback, useEffect, useState } from "react"
import { get } from "./api";
import { useSession } from "@/store/session";

/**
 * `since` is read once at call time, not subscribed to — it names a fixed moment (the
 * previous session's open time), and refetching whenever it changed would be refetching
 * on every render of a value that's already frozen for the session (see store/lastOpened).
 */
export const useDashboardSummary = (since?: string | null) => {
  const status = useSession((s) => s.status);
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null> (null);

  const refetch = useCallback(async () => {
    if (useSession.getState().status !== "authed") return;
    setLoading(true);
    setError(null);

    try {
      const query = since ? `?since=${encodeURIComponent(since)}` : "";
      const res = await get<DashboardSummary>(`/dashboard/summary${query}`);
      setData(res);
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
    finally {
      setLoading(false);
    }

  }, [since]);

  useEffect(() => {
    if (status === "authed") refetch();
  }, [status, refetch]);

  return { data, loading, error, refetch };
}

// The "For You" carousel's genuinely-new slides (a goal's ETA, a no-spend-day count, a
// weekday pattern) — its own request rather than a field on the summary above: these are
// ranked/omit-shaped, not scalars that response otherwise deals in.
export const useDashboardInsights = () => {
  const status = useSession((s) => s.status);
  const [data, setData] = useState<DashboardInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (useSession.getState().status !== "authed") return;
    setError(null);

    try {
      setData(await get<DashboardInsights>("/dashboard/insights"));
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
    finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authed") void refetch();
  }, [status, refetch]);

  return { data, loading, error, refetch };
};