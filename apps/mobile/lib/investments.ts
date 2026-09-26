import { useCallback, useEffect, useState } from "react";
import type { InvestedHow, InvestmentsPayload, ITransaction } from "@save-n-spend/types";
import { del, get, patch, post } from "@/lib/api";
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

/** "+12.4% a year" / "−6.8% a year". One decimal: a yearly return reads to a tenth. */
export const formatAnnual = (rate: number): string => {
  const pct = rate * 100;
  const sign = pct > 0.05 ? "+" : pct < -0.05 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(1)}% a year`;
};

export type InvestmentBasis = {
  /** Total invested so far, paise. The server works out the opening amount from it. */
  invested?: number;
  investedSince?: string | null;
  investedHow?: InvestedHow | null;
};

/** Corrects what's been invested, since when, and how. Today's value isn't touched — for
 *  that, the balance sync. Reloads the account store, since `startingBalance` moved. */
export const updateInvestmentBasis = async (id: string, basis: InvestmentBasis): Promise<void> => {
  await patch(`/investments/${id}/basis`, basis);
  await useAccountStore.getState().load().catch(() => {});
};

export type DeleteInvestmentMode = "undo" | "keep";

/** Removes a holding and everything on it. See the API's deleteInvestment for what the two
 *  modes do to the accounts on the other side of its money moves. */
export const deleteInvestment = async (id: string, mode: DeleteInvestmentMode): Promise<void> => {
  await del(`/investments/${id}?mode=${mode}`);
  await useAccountStore.getState().load().catch(() => {});
};
