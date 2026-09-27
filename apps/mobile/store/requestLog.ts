// The phone's own record of its last 50 API calls, for Settings → Diagnostics. Kept on the
// device rather than read from the server so it still has the calls that never reached it —
// offline, timed out, server asleep — which are exactly the ones worth seeing.
//
// Only what the server log keeps too: method, route pattern, result, time. No bodies.
import { create } from "zustand";
import { readJson, writeJson } from "@/lib/deviceStore";

const STORAGE_KEY = "sns.requestLog";
const MAX = 50;

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

interface RequestLogState {
  entries: RequestLogEntry[];
  hydrate: () => Promise<void>;
  add: (entry: RequestLogEntry) => void;
  clear: () => void;
}

export const useRequestLog = create<RequestLogState>((set, get) => ({
  entries: [],
  hydrate: async () => {
    const saved = await readJson<RequestLogEntry[]>(STORAGE_KEY);
    if (saved) set({ entries: saved });
  },
  add: (entry) => {
    const entries = [entry, ...get().entries].slice(0, MAX);
    set({ entries });
    void writeJson(STORAGE_KEY, entries);
  },
  clear: () => {
    set({ entries: [] });
    void writeJson(STORAGE_KEY, []);
  },
}));
