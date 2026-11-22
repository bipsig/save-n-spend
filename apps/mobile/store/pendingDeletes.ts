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
//
// The one exception is a delete the app never got to send: killed or suspended inside the
// window, or signed out with no token left to send it. The user saw it as done, so each
// delete is also written to disk (lib/pendingDeleteFile.ts) and replayed on the next
// authed launch or reconnect, with the same Idempotency-Key the timer would have sent.
import { create } from "zustand";
import { toast } from "@/store/toast";
import { useSession } from "@/store/session";
import { useConnectivity } from "@/store/connectivity";
import { useAccountStore } from "@/store/accounts";
import { del, patch, type RequestOptions } from "@/lib/api";
import { makeIdempotencyKey } from "@/lib/idempotency";
import { readPendingDeletes, updatePendingDeletes } from "@/lib/pendingDeleteFile";
import {
  deleteRequestFor, replayDeletes, withItem, withoutKey,
  type PersistedDelete, type ReplayRequest,
} from "@/lib/pendingDeleteReplay";

const DEFAULT_GRACE_MS = 5_000;

/** Receives the delete's Idempotency-Key, to pass on to the API call. */
type Commit = (opts: RequestOptions) => Promise<void>;

type ScheduleOptions = {
  ms?: number;
  /** The DELETE this stands for, kept on disk for a replay. Without it the key's own route is
   *  used (`deleteRequestFor`), as for deletes saved by 2.8.6 and older. */
  request?: ReplayRequest;
  /** Sent after a replayed DELETE lands, for what the commit does next (clearing a default). */
  after?: ReplayRequest[];
};

type Entry = {
  label: string;
  timer: ReturnType<typeof setTimeout>;
  commit: Commit;
  idempotencyKey: string;
  userId: string | null;
};

interface PendingDeletesState {
  /** Reactive — every list screen (and the shared account/category hooks) filters its
   *  own items against this. */
  keys: Set<string>;
  schedule: (key: string, label: string, commit: Commit, opts?: ScheduleOptions) => void;
  cancel: (key: string) => void;
  /** Sign-out safety net (see app/_layout.tsx's guest branch): a confirmed delete must
   *  not quietly revert itself just because the session that promised it ended first. */
  flushAll: () => Promise<void>;
}

// Module-level, not state anything renders — the actual timers and commit closures. The
// store's `keys` set is only the reactive mirror of this Map's key space.
const entries = new Map<string, Entry>();

const forget = (userId: string | null, key: string) => {
  if (userId) void updatePendingDeletes(userId, (items) => withoutKey(items, key));
};

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

    schedule: (key, label, commit, opts = {}) => {
      // Re-deleting mid-grace-window (shouldn't normally be reachable once a row is
      // hidden, but costs nothing to make safe) just restarts the clock, same key.
      const existing = entries.get(key);
      if (existing) clearTimeout(existing.timer);
      const idempotencyKey = existing?.idempotencyKey ?? makeIdempotencyKey();
      const userId = useSession.getState().user?._id ?? null;

      const request = opts.request ?? deleteRequestFor(key);
      if (userId && request) {
        const item: PersistedDelete = { key, label, idempotencyKey, requests: [request, ...(opts.after ?? [])], at: Date.now() };
        void updatePendingDeletes(userId, (items) => withItem(items, item));
      }

      const timer = setTimeout(() => {
        void commit({ idempotencyKey })
          .catch((err) => {
            toast.fromError(err, `Couldn't delete ${label} — it's back`);
          })
          // Off the disk either way: done, or refused and the row is back on screen.
          .finally(() => {
            forget(userId, key);
            settle(key);
          });
      }, opts.ms ?? DEFAULT_GRACE_MS);

      entries.set(key, { label, timer, commit, idempotencyKey, userId });
      set((s) => ({ keys: new Set(s.keys).add(key) }));
    },

    // What "Undo" calls. The real API call is never made.
    cancel: (key) => {
      const existing = entries.get(key);
      if (!existing) return;
      clearTimeout(existing.timer);
      forget(existing.userId, key);
      settle(key);
    },

    flushAll: async () => {
      const pending = [...entries.entries()];
      for (const [, e] of pending) clearTimeout(e.timer);
      entries.clear();
      set({ keys: new Set() });
      // By now the token may already be gone. A delete that didn't land stays on disk and
      // is sent when this user next signs in.
      await Promise.allSettled(pending.map(async ([key, e]) => {
        await e.commit({ idempotencyKey: e.idempotencyKey });
        forget(e.userId, key);
      }));
    },
  };
});

// ---- Replay -------------------------------------------------------------------------------

let replaying: Promise<void> | null = null;

const send = (request: ReplayRequest, idempotencyKey?: string) =>
  request.method === "DELETE"
    ? del(request.path, idempotencyKey ? { idempotencyKey } : undefined)
    : patch(request.path, request.body);

/** Sends the deletes an earlier run left on disk for this user. Safe to call any number of
 *  times; deletes still in their undo window are left to their timers. */
export const replayPendingDeletes = (userId: string): Promise<void> => {
  if (replaying) return replaying;
  replaying = (async () => {
    const items = (await readPendingDeletes(userId)).filter((i) => !entries.has(i.key));
    if (items.length === 0) return;
    // Hidden at once: the user already saw these go.
    usePendingDeletes.setState((s) => {
      const keys = new Set(s.keys);
      for (const i of items) keys.add(i.key);
      return { keys };
    });
    const result = await replayDeletes(items, {
      send,
      remove: (key) => updatePendingDeletes(userId, (list) => withoutKey(list, key)),
    });
    // A refused delete comes back on screen, and says so, as a refused timer commit does.
    // Done ones stay hidden for this run; the server no longer returns them.
    if (result.refused.length > 0) {
      usePendingDeletes.setState((s) => {
        const keys = new Set(s.keys);
        for (const { item } of result.refused) keys.delete(item.key);
        return { keys };
      });
      const { item, error } = result.refused[0];
      toast.fromError(error, `Couldn't delete ${item.label} — it's back`);
    }
    if (result.done.length > 0) void useAccountStore.getState().load().catch(() => {});
  })().finally(() => {
    replaying = null;
  });
  return replaying;
};

// On reaching `authed` (launch, sign-in) and on every reconnect.
useSession.subscribe((s, prev) => {
  if (s.status === "authed" && s.user && (prev.status !== "authed" || prev.user?._id !== s.user._id)) {
    void replayPendingDeletes(s.user._id);
  }
});
useConnectivity.subscribe((s, prev) => {
  const userId = useSession.getState().user?._id;
  if (prev.offline && !s.offline && useSession.getState().status === "authed" && userId) void replayPendingDeletes(userId);
});

export const pendingDeletes = {
  schedule: (key: string, label: string, commit: Commit, opts?: ScheduleOptions) =>
    usePendingDeletes.getState().schedule(key, label, commit, opts),
  cancel: (key: string) => usePendingDeletes.getState().cancel(key),
};
