import { useAccountStore } from "@/store/accounts";
import { useSession } from "@/store/session";
import { del, patch, post } from "@/lib/api";
import { applyOrder, persistOrder } from "@/lib/reorder";
import type { AccountType, IAccount } from "@save-n-spend/types";

export const useAccounts = () : IAccount[] => {
  return useAccountStore((s) => s.list);
}

// One account by id, reactive — re-renders when accounts load/change.
export const useAccountById = (id: string | null | undefined) : IAccount | undefined => {
  return useAccountStore((s) => (id ? s.list.find((c) => c._id === id) : undefined))
}

// One account by id, NON-reactive — for imperative code outside render (submit handlers).
export const accountById = (id: string | null | undefined): IAccount | undefined =>
  id ? useAccountStore.getState().list.find((c) => c._id === id) : undefined;

export const useDefaultAccount = () : IAccount | undefined => {
  const defaultAccountId = useSession((s) => s.user?.prefs.defaultAccount);
  return useAccountById (defaultAccountId);
}

// Mutations (Manage accounts).
// Each one refetches the list rather than patching it locally: the server owns
// `balance`, so a locally-spliced account could show a stale one.

export type AccountDraft = {
  name: string;
  type: AccountType;
  /** Paise. The opening figure. To correct the balance later, see `syncAccountBalance`. */
  startingBalance: number;
  icon?: string;
  color?: string;
};

export const createAccount = async (draft: AccountDraft): Promise<void> => {
  await post<IAccount>("/accounts", draft);
  await useAccountStore.getState().load();
};

// Deliberately no `startingBalance`: it is a term in the balance the server
// maintains, so editing it after the fact would silently restate every total.
// Correcting the CURRENT balance is `syncAccountBalance` below, which goes through
// a separate endpoint precisely so it can never happen by accident during a rename.
export const updateAccount = async (
  id: string,
  patchBody: { name?: string; type?: AccountType; icon?: string; color?: string }
): Promise<void> => {
  await patch<IAccount>(`/accounts/${id}`, patchBody);
  await useAccountStore.getState().load();
};

// Reconcile against what the bank actually says. `balance` is the TARGET figure in
// paise — the number the user is reading off their banking app — not a difference:
// the server works out the gap and records it as an adjustment, so the balance stays
// the sum of its history instead of becoming a number someone typed over the top.
//
// Signed, because a credit card's balance is negative as it is used.
export const syncAccountBalance = async (
  id: string,
  balance: number,
  note?: string
): Promise<void> => {
  await patch<IAccount>(`/accounts/${id}/balance`, note ? { balance, note } : { balance });
  await useAccountStore.getState().load();
};

/**
 * Writes the user's account order as `ids` reads front to back. Must be every live account:
 * the server ranks by position in the array, so a partial list leaves the ones it omits
 * colliding with the ones it sets.
 *
 * The store moves first and does NOT refetch on success — a tap that waits out a round trip
 * before the row moves doesn't read as moving anything, and the order is the client's own
 * answer anyway.
 */
export const reorderAccounts = async (ids: string[]): Promise<void> => {
  useAccountStore.setState((s) => ({ list: applyOrder(s.list, ids) }));

  try {
    await persistOrder("/accounts/reorder", ids);
  } catch (error) {
    // On screen is now a claim the server never accepted, and more taps may have landed
    // since — so the state to return to is the server's, not this call's starting point.
    await useAccountStore.getState().load().catch(() => {});
    throw error;
  }
};

// Archives rather than destroys — transactions keep pointing at a real account,
// so history stays readable.
export const archiveAccount = async (id: string): Promise<void> => {
  await del<null>(`/accounts/${id}`);
  await useAccountStore.getState().load();
};