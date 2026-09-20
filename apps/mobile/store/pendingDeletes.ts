// "Delete, but give them 5 seconds" — every destructive delete in the app schedules
// through here instead of calling the API immediately. Mirrors store/outbox.ts's
// module-level timer pattern: the Map below is machinery, not state anything renders, so
// it outlives whichever screen scheduled an entry — navigating away, even unmounting,
// cannot cancel a pending delete the way a component-owned timer would.
//
// This is deliberately the opposite of the outbox's philosophy. The outbox exists to make
// good on "this will sync eventually," queuing through an offline stretch if it has to. A
// deferred delete's entire promise is "you have 5 seconds to change your mind, right now"
// — so a failed commit here restores the row and says so, rather than disappearing into a
// background retry queue that could fire hours later on a different screen.
import { create } from "zustand";
import { toast } from "@/store/toast";

const DEFAULT_GRACE_MS = 5_000;

type Entry = {
  label: string;
  timer: ReturnType<typeof setTimeout>;
  commit: () => Promise<void>;
};

interface PendingDeletesState {
  /** Reactive — every list screen (and the shared account/category hooks) filters its
   *  own items against this. */
  keys: Set<string>;
  schedule: (key: string, label: string, commit: () => Promise<void>, ms?: number) => void;
  cancel: (key: string) => void;
  /** Sign-out safety net (see app/_layout.tsx's guest branch): a confirmed delete must
   *  not quietly revert itself just because the session that promised it ended first. */
  flushAll: () => Promise<void>;
}

// Module-level, not state anything renders — the actual timers and commit closures. The
// store's `keys` set is only the reactive mirror of this Map's key space.
const entries = new Map<string, Entry>();

export const usePendingDeletes = create<PendingDeletesState>((set) => {
  const settle = (key: string) => {
    entries.delete(key);
    set((s) => {
      if (!s.keys.has(key)) return s;
      const keys = new Set(s.keys);
      keys.delete(key);
      return { keys };
    });
  };

  return {
    keys: new Set(),

    schedule: (key, label, commit, ms = DEFAULT_GRACE_MS) => {
      // Re-deleting mid-grace-window (shouldn't normally be reachable once a row is
      // hidden, but costs nothing to make safe) just restarts the clock.
      const existing = entries.get(key);
      if (existing) clearTimeout(existing.timer);

      const timer = setTimeout(() => {
        void commit()
          .catch((err) => {
            toast.fromError(err, `Couldn't delete ${label} — it's back`);
          })
          .finally(() => settle(key));
      }, ms);

      entries.set(key, { label, timer, commit });
      set((s) => ({ keys: new Set(s.keys).add(key) }));
    },

    // What "Undo" calls. The real API call is never made.
    cancel: (key) => {
      const existing = entries.get(key);
      if (!existing) return;
      clearTimeout(existing.timer);
      settle(key);
    },

    flushAll: async () => {
      const pending = [...entries.values()];
      entries.clear();
      set({ keys: new Set() });
      await Promise.allSettled(pending.map((e) => e.commit()));
    },
  };
});

export const pendingDeletes = {
  schedule: (key: string, label: string, commit: () => Promise<void>, ms?: number) =>
    usePendingDeletes.getState().schedule(key, label, commit, ms),
  cancel: (key: string) => usePendingDeletes.getState().cancel(key),
};
