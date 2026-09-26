import { useCallback, useEffect, useState } from "react";
import type { CashFlowPayload } from "@save-n-spend/types";
import { get } from "@/lib/api";
import { useSession } from "@/store/session";

// Today through the end of next month, day by day — see the API's cashFlowMath.
export const useCashFlow = () => {
  const status = useSession((s) => s.status);
  const [data, setData] = useState<CashFlowPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (useSession.getState().status !== "authed") return;
    setError(null);
    try {
      setData(await get<CashFlowPayload>("/cash-flow"));
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

/** "Sat 28 Sep" from a `YYYY-MM-DD` key. Read in UTC because the key is a calendar date,
 *  not a moment (see lib/zone.ts). */
export const dayLabel = (key: string): string =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
