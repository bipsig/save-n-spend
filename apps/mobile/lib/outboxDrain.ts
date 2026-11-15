// One pass over the offline queue, FIFO, with persistence and sending passed in so the
// rules can be tested under node (lib/outboxDrain.test.ts). store/outbox.ts runs it.
import type { OutboxItem } from "./outbox";
import { decide } from "./outboxPolicy";

export type DrainDeps = {
  items: () => OutboxItem[];
  update: (fn: (items: OutboxItem[]) => OutboxItem[]) => void;
  /** Writes the current items to disk. */
  save: () => Promise<void>;
  send: (item: OutboxItem, idempotencyKey: string) => Promise<unknown>;
  makeKey: () => string;
  /** Retries in a row before this pass, for the backoff. */
  attempt: number;
};

export type DrainResult = {
  synced: number;
  retry: { delayMs: number; wait: boolean } | null;
  /** Retries in a row after this pass. */
  attempt: number;
};

export const drainQueue = async (deps: DrainDeps): Promise<DrainResult> => {
  let synced = 0;
  let attempt = deps.attempt;
  const without = (clientId: string) => deps.update((items) => items.filter((i) => i.clientId !== clientId));

  // Re-read the queue each pass rather than snapshotting it once, so an item a manual retry
  // re-queues mid-drain is picked up by this same run.
  while (true) {
    const item = deps.items().find((i) => i.status === "queued");
    if (!item) break;

    let key = item.idempotencyKey;
    if (!key) {
      // Queued by 2.6.0, which relied on the body clientId alone. The key is stored before
      // the first send, so every later try sends the same one. The clientId stays in the
      // body, so the server still recognises an item 2.6.0 already delivered.
      const made = deps.makeKey();
      key = made;
      deps.update((items) => items.map((i) => (i.clientId === item.clientId ? { ...i, idempotencyKey: made } : i)));
      await deps.save();
    }

    try {
      await deps.send(item, key);
      without(item.clientId);
      void deps.save();
      synced++;
      attempt = 0;
      continue;
    }
    catch (err) {
      const decision = decide(err, attempt + 1);
      if (decision.kind === "synced") {
        without(item.clientId);
        void deps.save();
        synced++;
        attempt = 0;
        continue;
      }
      if (decision.kind === "stop") return { synced, retry: null, attempt };
      if (decision.kind === "retry") {
        // The server is unreachable or busy; the rest of the queue would fare the same.
        return { synced, retry: { delayMs: decision.delayMs, wait: decision.wait }, attempt: attempt + 1 };
      }
      // Visible, never silent, and it must not block the rest of the queue.
      deps.update((items) => items.map((i) => (
        i.clientId === item.clientId
          ? { ...i, status: "failed" as const, error: decision.message, errorCode: decision.code }
          : i
      )));
      void deps.save();
      attempt = 0;
    }
  }
  return { synced, retry: null, attempt };
};
