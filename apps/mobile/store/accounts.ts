import { getFetched } from "@/lib/api";
import type { IAccount } from "@save-n-spend/types";
import { create } from "zustand";

interface AccountState {
  list: IAccount[];
  loaded: boolean;
  /** When the list was fetched (ms epoch); from the cache entry when served offline. */
  fetchedAt: number | null;
  load: () => Promise<void>;
  reset: () => void;
}

export const useAccountStore = create<AccountState>((set) => ({
  list: [],
  loaded: false,
  fetchedAt: null,

  load: async () => {
    const { data: list, fetchedAt } = await getFetched<IAccount[]>('/accounts');
    set({ list, loaded: true, fetchedAt });
  },

  reset: () => set({ list: [], loaded: false, fetchedAt: null }),
}));