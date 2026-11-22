import type { InvestedHow, InvestmentsPayload, ITransaction, PortfolioTrend } from "@save-n-spend/types";
import { patch, post, type RequestOptions } from "@/lib/api";
import { useApiQuery } from "@/lib/query/useApiQuery";
import { useAccountStore } from "@/store/accounts";
import { chartPalette, chartOthers } from "@/theme";
import type { DonutSlice } from "@/components/charts/DonutChart";
import type { IconName } from "@/lib/icons";
import { chipTintFor, type ChipTint } from "@/theme/gradients";
import { formatPct } from "@/lib/format/pct";

// The Investments hub's data.
// `enabled` lets a screen that only sometimes needs this (add-transaction, in redeem mode)
// mount the hook unconditionally without paying for the fetch when it doesn't.
export const useInvestments = (enabled = true) => useApiQuery<InvestmentsPayload>("/investments", { enabled });

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
export const convertToInvestment = async (transactionId: string, toAccount: string, opts?: RequestOptions): Promise<void> => {
  await post<ITransaction>(`/transactions/${transactionId}/convert-to-investment`, { toAccount }, opts);
  await useAccountStore.getState().load().catch(() => {});
};

/** "+12.4% a year" / "−6.8% a year". `rate` is a fraction (0.124). */
export const formatAnnual = (rate: number): string => `${formatPct(rate * 100, { kind: "return" })} a year`;

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

/** What a holding's delete reloads beyond the screens' reads (balances it moved). */
export const reloadAfterInvestmentDelete = () => useAccountStore.getState().load();

/** A holding's own icon and colour — what every SIP bill, contribution and redemption wears,
 *  so each one is recognisable as *that* holding rather than a generic "investment". */
export const holdingLook = (holding?: { icon?: string; color?: string } | null): { icon: IconName; tint: ChipTint } => ({
  icon: (holding?.icon ?? "investments") as IconName,
  tint: chipTintFor(holding?.color),
});

/** Month-end history of every holding, derived on the server from records already kept. */
export const useInvestmentTrend = (enabled = true) => useApiQuery<PortfolioTrend>("/investments/trend", { enabled });

/** One holding's money moves and value updates, newest first. The general transactions feed
 *  drops the value updates (adjustments); this keeps them. A 404 for an id that isn't a holding. */
export const useInvestmentHistory = (id: string | null | undefined) =>
  useApiQuery<ITransaction[]>(id ? `/investments/${id}/history` : null, { errorMessage: "Couldn't load history" });
