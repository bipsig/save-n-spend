import { useCallback, useEffect, useState } from "react";
import type { InvestmentsPayload, ITransaction } from "@save-n-spend/types";
import { get, post } from "@/lib/api";
import { useAccountStore } from "@/store/accounts";
import { useSession } from "@/store/session";
import { chartPalette, chartOthers } from "@/theme";
import type { DonutSlice } from "@/components/charts/DonutChart";

// The Investments hub's data — same single-fetch shape as useHealthScore/useDashboardSummary.
// `enabled` lets a screen that only sometimes needs this (add-transaction, in redeem mode)
// mount the hook unconditionally without paying for the fetch when it doesn't.
export const useInvestments = (enabled = true) => {
  const status = useSession((s) => s.status);
  const [data, setData] = useState<InvestmentsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (useSession.getState().status !== "authed") return;
    setError(null);
    try {
      setData(await get<InvestmentsPayload>("/investments"));
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
    finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled && status === "authed") void refetch();
  }, [enabled, status, refetch]);

  return { data, loading, error, refetch };
};

/** Allocation-by-kind → the shared DonutChart's slice shape. Colours assigned by rank
 *  from the validated chart palette, the tail folding into a neutral grey, exactly as the
 *  Insights category donut does. */
export const allocationSlices = (allocation: { kind: string; current: number }[]): DonutSlice[] => {
  const total = allocation.reduce((sum, a) => sum + a.current, 0);
  return allocation.map((a, i) => ({
    id: a.kind,
    name: a.kind,
    total: a.current,
    pct: total > 0 ? (a.current / total) * 100 : 0,
    color: i < chartPalette.length ? chartPalette[i] : chartOthers,
  }));
};

/** Simple return: gain over what's still invested. Null when there's no cost basis to
 *  measure against (nothing contributed, or fully redeemed). */
export const returnPct = (invested: number, gain: number): number | null =>
  invested > 0 ? (gain / invested) * 100 : null;

/** Reclassify an existing expense as an investment contribution (transfer into the chosen
 *  investment account). Reloads the account store, since a balance moved. */
export const convertToInvestment = async (transactionId: string, toAccount: string): Promise<void> => {
  await post<ITransaction>(`/transactions/${transactionId}/convert-to-investment`, { toAccount });
  await useAccountStore.getState().load().catch(() => {});
};
