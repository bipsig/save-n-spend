// Device-local, like privacy mode and the Get-started dismissal: "since you last opened
// the app" is about this phone's own session history, not an account fact. Keyed by user
// id (a map, not a single timestamp) for the same reason `getStartedDismissed` is a list —
// two people sharing one phone must not inherit each other's "last opened".
import { create } from "zustand";
import { readJson, writeJson } from "@/lib/deviceStore";

const STORAGE_KEY = "sns.lastOpenedAt";

type LastOpenedMap = Record<string, string>; // userId -> ISO timestamp

interface LastOpenedState {
  /** The PREVIOUS session's open time for this user — read once at hydrate and held for
   *  the whole session, so a digest built from it keeps meaning "before now" even though
   *  this session's own start time is written back to storage immediately after. Null on
   *  a first-ever launch, when there is nothing yet to compare against. */
  previousOpenedAt: string | null;
  hydrated: boolean;
  hydrate: (userId: string) => Promise<void>;
}

export const useLastOpened = create<LastOpenedState>((set) => ({
  previousOpenedAt: null,
  hydrated: false,

  hydrate: async (userId) => {
    const stored = await readJson<LastOpenedMap>(STORAGE_KEY);
    set({ previousOpenedAt: stored?.[userId] ?? null, hydrated: true });
    void writeJson(STORAGE_KEY, { ...stored, [userId]: new Date().toISOString() });
  },
}));
