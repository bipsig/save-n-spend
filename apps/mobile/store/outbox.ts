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
import { post } from "@/lib/api";
import { afterWrite } from "@/lib/query/invalidate";
import { readOutbox, writeOutbox, type OutboxItem } from "@/lib/outbox";
import { drainQueue } from "@/lib/outboxDrain";
import { makeIdempotencyKey } from "@/lib/idempotency";
import { useAccountStore } from "@/store/accounts";
import { toast } from "@/store/toast";

interface OutboxState {
  userId: string | null;
  items: OutboxItem[];
  /** Bumped after any drain that synced at least one item — screens key their
   *  focus-refresh off this the same way they already do off a hook's own `refetch`. */
  lastDrainedAt: number;
  load: (userId: string) => Promise<void>;
  resetMemory: () => void;
  /** `idempotencyKey` defaults to the clientId, which is what Add Transaction sends. */
  enqueue: (clientId: string, payload: Record<string, unknown>, idempotencyKey?: string) => Promise<void>;
  retry: (clientId: string) => void;
  discard: (clientId: string) => void;
  drain: () => Promise<void>;
  asPendingTransactions: () => ITransaction[];
}

// Module-level, not state anything renders — mirrors store/wake.ts's `inFlight`. A
// concurrent auto-drain (on reconnect) and a manual "Retry" tap can never double-send.
let draining: Promise<void> | null = null;
// Backoff between failed passes. `notBefore` is set only when the server named a wait
// (Retry-After); a reconnect or launch may otherwise drain straight away.
let attempt = 0;
let notBefore = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

const clearRetry = () => {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
};

export const useOutbox = create<OutboxState>((set, get) => {
  const persist = (items: OutboxItem[]) => {
    const { userId } = get();
    if (userId) void writeOutbox(userId, items);
  };

  const drain = (): Promise<void> => {
    if (draining) return draining;
    if (Date.now() < notBefore) return Promise.resolve();

    draining = (async () => {
      clearRetry();
      const result = await drainQueue({
        items: () => get().items,
        update: (fn) => set((s) => ({ items: fn(s.items) })),
        save: async () => {
          const { userId, items } = get();
          if (userId) await writeOutbox(userId, items);
        },
        // One refresh after the pass, not one per queued row.
        send: (item, idempotencyKey) => post("/transactions", item.payload, { idempotencyKey, invalidate: false }),
        makeKey: makeIdempotencyKey,
        attempt,
      });
      attempt = result.attempt;
      if (result.retry) {
        const { delayMs, wait } = result.retry;
        notBefore = wait ? Date.now() + delayMs : 0;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          notBefore = 0;
          void drain();
        }, delayMs);
      }

      if (result.synced > 0) {
        set({ lastDrainedAt: Date.now() });
        afterWrite("/transactions");
        toast.success(`Synced ${result.synced} transaction${result.synced === 1 ? "" : "s"}`);
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
    resetMemory: () => {
      clearRetry();
      attempt = 0;
      notBefore = 0;
      set({ userId: null, items: [] });
    },

    enqueue: async (clientId, payload, idempotencyKey = clientId) => {
      const items = [...get().items, {
        clientId,
        payload,
        createdAt: Date.now(),
        status: "queued" as const,
        idempotencyKey,
      }];
      set({ items });
      // Awaited: a "saved offline" toast must never precede the write it describes — an
      // app kill right after would otherwise lose the queued transaction outright.
      await writeOutbox(get().userId!, items);
    },

    retry: (clientId) => {
      set((s) => ({
        items: s.items.map((i) => (i.clientId === clientId
          ? {
              ...i,
              status: "queued" as const,
              error: undefined,
              errorCode: undefined,
              // The server saw this key with another body, so it can never succeed. The body
              // clientId still stops a second copy.
              ...(i.errorCode === "idempotency_mismatch" ? { idempotencyKey: makeIdempotencyKey() } : {}),
            }
          : i)),
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
