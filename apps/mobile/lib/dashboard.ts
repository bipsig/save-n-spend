import type { DashboardSummary } from "@save-n-spend/types"
import { useCallback, useEffect, useState } from "react"
import { get } from "./api";
import { useSession } from "@/store/session";

export const useDashboardSummary = () => {
  const status = useSession((s) => s.status);
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null> (null);

  const refetch = useCallback(async () => {
    if (useSession.getState().status !== "authed") return;
    setLoading(true);
    setError(null);

    try {
      const res = await get<DashboardSummary>("/dashboard/summary");
      setData(res);
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

  return { data, loading, error, refetch };
}