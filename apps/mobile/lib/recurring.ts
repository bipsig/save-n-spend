import type { RecurringSuggestionsPayload } from "@save-n-spend/types";
import { post, type RequestOptions } from "@/lib/api";
import { useAccountStore } from "@/store/accounts";
import { useApiQuery } from "@/lib/query/useApiQuery";

const EMPTY: RecurringSuggestionsPayload = { expenses: [], income: [] };

// Repeating payments and income the server spotted in the history. Bills shows the expenses
// as "set these up as bills"; the cash-flow calendar uses the income as what's expected.
export const useRecurringSuggestions = () => {
  // Suggestions are a nicety: a failed fetch just shows none, never an error state.
  const { data, loading, refreshing, refetch, fetchedAt } = useApiQuery<RecurringSuggestionsPayload>("/recurring");
  return { data: data ?? EMPTY, loading, refreshing, refetch, fetchedAt };
};

/** "Not recurring" / "not a regular income" — remembered on the account, so it holds on
 *  every device. */
export const dismissRecurring = (key: string) => post<null>("/recurring/dismiss", { key });

/** Moves past SIP payments (logged as expenses) into the holding, in one go. */
/** The number moved, or null when the reply had no count (see lib/replayed.ts). */
export const bulkConvertToInvestment = async (transactionIds: string[], toAccount: string, opts?: RequestOptions): Promise<number | null> => {
  const result = await post<{ converted: number } | null>("/transactions/convert-to-investment", { transactionIds, toAccount }, opts);
  await useAccountStore.getState().load().catch(() => {});
  return result?.converted ?? null;
};
