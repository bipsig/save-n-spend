// The single source of truth for "who is logged in".
// Holds the token (mirrored into SecureStore) and the user, plus the three
// lifecycle actions. Kept free of any `api` import so there's no import cycle
// (api.ts imports THIS to read the token / sign out on 401).
import { create } from 'zustand';
import type { IUser } from '@save-n-spend/types';
import * as secure from '@/lib/secure';

// loading = still checking SecureStore on boot; authed = token verified via /me;
// guest = no token (or signed out) → show the auth screens.
type Status = 'loading' | 'authed' | 'guest';

interface SessionState {
  status: Status;
  token: string | null;
  user: IUser | null;
  hydrate: () => Promise<void>;
  signIn: (token: string) => Promise<void>;
  setUser: (user: IUser) => void;
  signOut: () => Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  token: null,
  user: null,

  // On app start: pull any saved token into memory. If there is one we stay in
  // `loading` — the boot flow (P1.2) will call GET /auth/me to verify it and
  // fill `user`, then flip to `authed`. No token → straight to `guest`.
  hydrate: async () => {
    const token = await secure.getToken();
    if (!token) {
      set({ status: 'guest', token: null, user: null });
      return;
    }
    set({ token });
  },

  // After a successful login: persist the token and put it in memory. `user`
  // gets filled by the follow-up /auth/me call via setUser.
  signIn: async (token) => {
    await secure.setToken(token);
    set({ token });
  },

  setUser: (user) => set({ user, status: 'authed' }),

  // Wipe everything and drop back to the auth screens. Idempotent — safe for the
  // 401 interceptor to call repeatedly.
  signOut: async () => {
    await secure.clearToken();
    set({ status: 'guest', token: null, user: null });
  },
}));
