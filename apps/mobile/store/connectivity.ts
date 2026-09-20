// One flag the whole app reads to know whether the last request reached the server.
// Flipped by lib/api.ts itself — every request already goes through one function, so
// that is the one place "online" or "offline" is actually known, rather than a second
// probe duplicating what a real request just learned.
//
// Kept free of any `api` import, so nothing here can join an import cycle — lib/api.ts
// imports THIS to report reachability.
import { AppState } from "react-native";
import { create } from "zustand";
import { HEALTH_URL } from "@/lib/apiBase";
import { readJson, writeJson } from "@/lib/deviceStore";

const LAST_ONLINE_KEY = "sns.lastOnlineAt";

/** How often to re-check while offline and the app is in front. Not tighter — a tight
 *  loop adds load to a server that may be the reason we're offline in the first place. */
const RECHECK_INTERVAL_MS = 30_000;

const PING_TIMEOUT_MS = 5_000;

interface ConnectivityState {
  /** False until `hydrate()` has read the last-known online time. */
  hydrated: boolean;
  offline: boolean;
  lastOnlineAt: number | null;
  hydrate: () => Promise<void>;
  reportOnline: () => void;
  reportOffline: () => void;
  recheckNow: () => Promise<void>;
}

// Module-level machinery, not state anything renders — mirrors store/wake.ts's `inFlight`.
let recheckTimer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;

const ping = async (): Promise<boolean> => {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), PING_TIMEOUT_MS);
  try {
    await fetch(HEALTH_URL, { method: "GET", signal: abort.signal });
    return true;
  }
  catch {
    return false; // timed out, DNS failure, no route — the same answer here
  }
  finally {
    clearTimeout(timer);
  }
};

export const useConnectivity = create<ConnectivityState>((set, get) => {
  const stopRecheck = () => {
    if (recheckTimer) {
      clearInterval(recheckTimer);
      recheckTimer = null;
    }
    if (appStateSub) {
      appStateSub.remove();
      appStateSub = null;
    }
  };

  const recheckNow = async (): Promise<void> => {
    if (await ping()) get().reportOnline();
  };

  const startRecheck = () => {
    if (recheckTimer) return; // already watching
    recheckTimer = setInterval(() => void recheckNow(), RECHECK_INTERVAL_MS);
    appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") void recheckNow();
    });
  };

  return {
    hydrated: false,
    offline: false,
    lastOnlineAt: null,

    hydrate: async () => {
      const saved = await readJson<number>(LAST_ONLINE_KEY);
      set({ lastOnlineAt: saved ?? null, hydrated: true });
    },

    reportOnline: () => {
      const now = Date.now();
      set({ offline: false, lastOnlineAt: now });
      void writeJson(LAST_ONLINE_KEY, now);
      stopRecheck();
    },

    // Idempotent: every failed request calls this, not just the first.
    reportOffline: () => {
      if (!get().offline) set({ offline: true });
      startRecheck();
    },

    recheckNow,
  };
});
