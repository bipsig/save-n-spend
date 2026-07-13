// The user's categories (defaults seeded at register + any they create), fetched
// once after login and held in memory. Mirrors the `session` store's shape: a
// plain Zustand store the whole app reads, plus a sync `getState()` path so
// non-reactive helpers (categoryById) can look one up without a hook.
import { create } from 'zustand';
import type { ICategory } from '@save-n-spend/types';
import { get } from '@/lib/api';

interface CategoryState {
  list: ICategory[];
  loaded: boolean;
  load: () => Promise<void>;
  reset: () => void;
}

export const useCategoryStore = create<CategoryState>((set) => ({
  list: [],
  loaded: false,

  // Pull the user's categories from the API. Called when the session flips to
  // `authed` (boot-with-token or fresh login) — see the effect in _layout.
  load: async () => {
    const list = await get<ICategory[]>('/categories');
    set({ list, loaded: true });
  },

  // On sign-out: drop the previous user's categories so the next login starts clean.
  reset: () => set({ list: [], loaded: false }),
}));
