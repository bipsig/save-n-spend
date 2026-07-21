import { useAccountStore } from "@/store/accounts";
import { useSession } from "@/store/session";
import type { IAccount } from "@save-n-spend/types";

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