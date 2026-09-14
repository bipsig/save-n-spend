// Every title this user has typed before, fetched once after login and held in memory —
// the raw material for the add-transaction form's autosuggest. Mirrors store/categories.ts:
// a plain Zustand store the whole app reads, loaded once rather than per form open, so
// opening Add Transaction (the single most frequent action in the app) never waits on a
// network round-trip for a feature that's really just filtering an array the client
// already has.
import { create } from 'zustand';
import type { ITitleSuggestion } from '@save-n-spend/types';
import { get } from '@/lib/api';

interface TitleSuggestionState {
  list: ITitleSuggestion[];
  loaded: boolean;
  load: () => Promise<void>;
  reset: () => void;
}

export const useTitleSuggestionStore = create<TitleSuggestionState>((set) => ({
  list: [],
  loaded: false,

  // Called when the session flips to `authed` — see the effect in _layout.
  load: async () => {
    const list = await get<ITitleSuggestion[]>('/transactions/title-suggestions');
    set({ list, loaded: true });
  },

  // On sign-out: drop the previous user's titles so the next login starts clean.
  reset: () => set({ list: [], loaded: false }),
}));
