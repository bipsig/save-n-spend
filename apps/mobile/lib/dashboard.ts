import type { DashboardSummary } from "@save-n-spend/types"
import { useCallback, useEffect, useState } from "react"
import { get } from "./api";

export const useDashboardSummary = () => {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null> (null);

  const refetch = useCallback(async () => {
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
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}