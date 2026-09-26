import { useCallback, useEffect, useState } from "react";
import type { RecurringSuggestionsPayload } from "@save-n-spend/types";
import { get, post } from "@/lib/api";
import { useAccountStore } from "@/store/accounts";
import { useSession } from "@/store/session";

const EMPTY: RecurringSuggestionsPayload = { expenses: [], income: [] };

// Repeating payments and income the server spotted in the history. Bills shows the expenses
// as "set these up as bills"; the cash-flow calendar uses the income as what's expected.
export const useRecurringSuggestions = () => {
  const status = useSession((s) => s.status);
  const [data, setData] = useState<RecurringSuggestionsPayload>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (useSession.getState().status !== "authed") return;
    try {
      setData(await get<RecurringSuggestionsPayload>("/recurring"));
    }
    catch {
      // Suggestions are a nicety — a failed fetch just shows none, never an error state.
    }
    finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authed") void refetch();
  }, [status, refetch]);

  return { data, loading, refetch };
};

/** "Not recurring" / "not a regular income" — remembered on the account, so it holds on
 *  every device. */
export const dismissRecurring = (key: string) => post<null>("/recurring/dismiss", { key });

/** Moves past SIP payments (logged as expenses) into the holding, in one go. */
export const bulkConvertToInvestment = async (transactionIds: string[], toAccount: string): Promise<number> => {
  const { converted } = await post<{ converted: number }>("/transactions/convert-to-investment", { transactionIds, toAccount });
  await useAccountStore.getState().load().catch(() => {});
  return converted;
};
