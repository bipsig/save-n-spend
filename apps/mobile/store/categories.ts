// The user's categories (defaults seeded at register + any they create), fetched
// once after login and held in memory. Mirrors the `session` store's shape: a
// plain Zustand store the whole app reads, plus a sync `getState()` path so
// non-reactive helpers (categoryById) can look one up without a hook.
import { create } from 'zustand';
import type { ICategory } from '@save-n-spend/types';
import { get } from '@/lib/api';
import { liveOnly } from '@/lib/categoryLabel';

interface CategoryState {
  /** Live categories only: what pickers, budgets, filters and the manage screen offer. */
  list: ICategory[];
  /** Live and archived, for naming rows filed under a category the user has since retired. */
  all: ICategory[];
  loaded: boolean;
  load: () => Promise<void>;
  reset: () => void;
}

export const useCategoryStore = create<CategoryState>((set) => ({
  list: [],
  all: [],
  loaded: false,

  // Pull the user's categories from the API. Called when the session flips to
  // `authed` (boot-with-token or fresh login) — see the effect in _layout.
  load: async () => {
    const all = await get<ICategory[]>('/categories?include=archived');
    set({ all, list: liveOnly(all), loaded: true });
  },

  // On sign-out: drop the previous user's categories so the next login starts clean.
  reset: () => set({ list: [], all: [], loaded: false }),
}));
