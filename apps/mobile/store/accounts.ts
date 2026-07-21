import { get } from "@/lib/api";
import type { IAccount } from "@save-n-spend/types";
import { create } from "zustand";

interface AccountState {
  list: IAccount[];
  loaded: boolean;
  load: () => Promise<void>;
  reset: () => void;
}

export const useAccountStore = create<AccountState>((set) => ({
  list: [],
  loaded: false,

  load: async () => {
    const list = await get<IAccount[]>('/accounts');
    set({ list, loaded: true });
  },

  reset: () => set({ list: [], loaded: false }),
}));