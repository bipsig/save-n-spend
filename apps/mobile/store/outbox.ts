// New transactions captured while offline, replayed once the server is reachable again.
//
// Server effects are pure `$inc`s (see the API's transactionService.applyEffects) —
// commutative, so replay order can't corrupt a balance even if a mid-queue item fails —
// but FIFO is kept anyway for correct history ordering and predictable budget-alert timing.
//
// Kept free of any import from lib/offlineCache.ts: that cache is wiped on every sign-out,
// this queue deliberately is not (see lib/outbox.ts's own doc comment).
import { create } from "zustand";
import type { ITransaction } from "@save-n-spend/types";
import { ApiError, post } from "@/lib/api";
import { readOutbox, writeOutbox, type OutboxItem } from "@/lib/outbox";
import { useAccountStore } from "@/store/accounts";
import { toast } from "@/store/toast";

export const makeClientId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

interface OutboxState {
  userId: string | null;
  items: OutboxItem[];
  /** Bumped after any drain that synced at least one item — screens key their
   *  focus-refresh off this the same way they already do off a hook's own `refetch`. */
  lastDrainedAt: number;
  load: (userId: string) => Promise<void>;
  resetMemory: () => void;
  enqueue: (clientId: string, payload: Record<string, unknown>) => Promise<void>;
  retry: (clientId: string) => void;
  discard: (clientId: string) => void;
  drain: () => Promise<void>;
  asPendingTransactions: () => ITransaction[];
}

// Module-level, not state anything renders — mirrors store/wake.ts's `inFlight`. A
// concurrent auto-drain (on reconnect) and a manual "Retry" tap can never double-send.
let draining: Promise<void> | null = null;

export const useOutbox = create<OutboxState>((set, get) => {
  const persist = (items: OutboxItem[]) => {
    const { userId } = get();
    if (userId) void writeOutbox(userId, items);
  };

  const drain = (): Promise<void> => {
    if (draining) return draining;

    draining = (async () => {
      let synced = 0;

      // Re-read the queue each pass rather than snapshotting it once, so an item a
      // manual retry re-queues mid-drain is picked up by this same run.
      while (true) {
        const item = get().items.find((i) => i.status === "queued");
        if (!item) break;

        try {
          await post("/transactions", item.payload);
          set((s) => ({ items: s.items.filter((i) => i.clientId !== item.clientId) }));
          persist(get().items);
          synced++;
        }
        catch (err) {
          if (!(err instanceof ApiError)) break;

          // Already applied — the exact outcome the clientId dedupe exists to produce
          // for a replay after a lost response.
          if (err.status === 409) {
            set((s) => ({ items: s.items.filter((i) => i.clientId !== item.clientId) }));
            persist(get().items);
            synced++;
            continue;
          }
          // Unreachable, or the sign-out interceptor is already handling a 401 — stop,
          // leave the rest of the queue exactly as it is.
          if (err.status === 0 || err.status === 401) break;
          // The server answered but is broken — hammering it with the rest of the
          // queue is pointless; try again on the next drain.
          if (err.status >= 500) break;

          // A real validation failure (its category was deleted elsewhere, say) —
          // visible, never silent, and must not block the rest of the queue.
          set((s) => ({
            items: s.items.map((i) => (
              i.clientId === item.clientId
                ? { ...i, status: "failed" as const, error: err.message }
                : i
            )),
          }));
          persist(get().items);
        }
      }

      if (synced > 0) {
        set({ lastDrainedAt: Date.now() });
        toast.success(`Synced ${synced} transaction${synced === 1 ? "" : "s"}`);
        void useAccountStore.getState().load().catch(() => {});
      }
    })().finally(() => {
      draining = null;
    });

    return draining;
  };

  return {
    userId: null,
    items: [],
    lastDrainedAt: 0,

    load: async (userId) => {
      const items = await readOutbox(userId);
      set({ userId, items });
    },

    // In-memory only — the file stays, so the same user's queue is there again on their
    // next authed launch (see app/_layout.tsx's guest branch).
    resetMemory: () => set({ userId: null, items: [] }),

    enqueue: async (clientId, payload) => {
      const items = [...get().items, {
        clientId,
        payload,
        createdAt: Date.now(),
        status: "queued" as const,
      }];
      set({ items });
      // Awaited: a "saved offline" toast must never precede the write it describes — an
      // app kill right after would otherwise lose the queued transaction outright.
      await writeOutbox(get().userId!, items);
    },

    retry: (clientId) => {
      set((s) => ({
        items: s.items.map((i) => (i.clientId === clientId ? { ...i, status: "queued" as const, error: undefined } : i)),
      }));
      persist(get().items);
      void drain();
    },

    discard: (clientId) => {
      set((s) => ({ items: s.items.filter((i) => i.clientId !== clientId) }));
      persist(get().items);
    },

    drain,

    // Synthetic rows for the feed/dashboard to merge in — shaped like the real thing
    // (the server returns) so TransactionRow needs no special case, only the two new
    // `pending`/`failed` props.
    asPendingTransactions: () => get().items.map((item) => ({
      _id: item.clientId,
      clientId: item.clientId,
      ...item.payload,
    } as unknown as ITransaction)),
  };
});
