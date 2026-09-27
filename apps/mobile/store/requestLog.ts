// The phone's own record of its last 50 API calls, for Settings → Diagnostics. Kept on the
// device rather than read from the server so it still has the calls that never reached it —
// offline, timed out, server asleep — which are exactly the ones worth seeing.
//
// Only what the server log keeps too: method, route pattern, result, time. No bodies.
//
// A plain file, not deviceStore: that's SecureStore, which is for small secrets and warns (and
// may drop the write) past 2 KB — fifty entries are well over. Same documentDirectory JSON as
// lib/offlineCache. Writes are batched, since every API call adds an entry.
import { create } from "zustand";
import * as FileSystem from "expo-file-system/legacy";

const FILE = `${FileSystem.documentDirectory}request-log.json`;
const MAX = 50;
const WRITE_DELAY_MS = 1000;

export type RequestLogEntry = {
  requestId: string;
  method: string;
  route: string;
  /** 0 when nothing came back. */
  status: number;
  durationMs: number;
  /** ISO. */
  at: string;
  /** The error message on a failure. */
  message?: string;
};

let writeTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleWrite = (entries: RequestLogEntry[]) => {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    FileSystem.writeAsStringAsync(FILE, JSON.stringify(entries)).catch(() => {
      // Lost on the next restart, nothing more — never worth interrupting a request over.
    });
  }, WRITE_DELAY_MS);
};

interface RequestLogState {
  entries: RequestLogEntry[];
  hydrate: () => Promise<void>;
  add: (entry: RequestLogEntry) => void;
  /** Empties it — the Diagnostics "Clear" button, and sign-out (the next account's calls
   *  aren't this one's). */
  clear: () => void;
}

export const useRequestLog = create<RequestLogState>((set, get) => ({
  entries: [],
  hydrate: async () => {
    try {
      const raw = await FileSystem.readAsStringAsync(FILE);
      const saved = JSON.parse(raw) as RequestLogEntry[];
      // Anything logged since launch goes first; the saved list follows.
      if (Array.isArray(saved)) set({ entries: [...get().entries, ...saved].slice(0, MAX) });
    }
    catch {
      // No file yet — the ordinary first launch.
    }
  },
  add: (entry) => {
    const entries = [entry, ...get().entries].slice(0, MAX);
    set({ entries });
    scheduleWrite(entries);
  },
  clear: () => {
    set({ entries: [] });
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = null;
    void FileSystem.deleteAsync(FILE, { idempotent: true }).catch(() => {});
  },
}));
