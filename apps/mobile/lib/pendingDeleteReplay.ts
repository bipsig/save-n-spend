// Confirmed deletes that outlive the app. A delete waits out its 5-second undo window in
// memory (store/pendingDeletes.ts) but is also written to disk, so one the user saw as done
// still reaches the server if the app is killed or suspended before the timer fires. Pure,
// so it's tested under node (lib/pendingDeleteReplay.test.ts).
import { ApiError } from "./apiError";
import { decide } from "./outboxPolicy";

export type ReplayRequest = { method: "DELETE" | "PATCH"; path: string; body?: unknown };

export type PersistedDelete = {
  /** The pending-delete key, `<kind>:<id>`. */
  key: string;
  label: string;
  /** Sent with the DELETE from the timer and from every replay. */
  idempotencyKey: string;
  /** The DELETE first, then anything that only makes sense once it has happened. */
  requests: ReplayRequest[];
  at: number;
};

// The keys every screen already schedules with, and the route each one deletes through.
const ROUTES: Record<string, string> = {
  transaction: "/transactions",
  goal: "/goals",
  bill: "/bills",
  category: "/categories",
  account: "/accounts",
};

/** The DELETE a pending-delete key stands for, or null for a key this file doesn't know
 *  (that delete then stays in memory only, as before). */
export const deleteRequestFor = (key: string): ReplayRequest | null => {
  const match = /^([a-z]+):([A-Za-z0-9]+)$/.exec(key);
  const route = match ? ROUTES[match[1]] : undefined;
  return route ? { method: "DELETE", path: `${route}/${match![2]}` } : null;
};

export const withItem = (items: PersistedDelete[], item: PersistedDelete): PersistedDelete[] =>
  [...items.filter((i) => i.key !== item.key), item];

export const withoutKey = (items: PersistedDelete[], key: string): PersistedDelete[] =>
  items.filter((i) => i.key !== key);

export type ReplayOutcome = "done" | "keep" | "refused" | "stop";

/** What a DELETE's answer means for the item on disk. */
export const outcomeOf = (err: unknown): ReplayOutcome => {
  if (err === null) return "done";
  // Already gone: the timer's own DELETE got there before the app died, or another device.
  if (err instanceof ApiError && (err.code === "not_found" || (err.code === null && err.status === 404))) return "done";
  const decision = decide(err, 1);
  if (decision.kind === "synced") return "done";
  if (decision.kind === "failed") return "refused";
  if (decision.kind === "stop") return "stop";
  return "keep";
};

export type ReplayDeps = {
  send: (request: ReplayRequest, idempotencyKey?: string) => Promise<unknown>;
  /** Drops the item from disk. */
  remove: (key: string) => Promise<void>;
};

export type ReplayResult = { done: PersistedDelete[]; refused: { item: PersistedDelete; error: unknown }[]; kept: PersistedDelete[] };

export const replayDeletes = async (items: PersistedDelete[], deps: ReplayDeps): Promise<ReplayResult> => {
  const result: ReplayResult = { done: [], refused: [], kept: [] };
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const [first, ...after] = item.requests;
    let error: unknown = null;
    try {
      await deps.send(first, item.idempotencyKey);
    }
    catch (err) {
      error = err;
    }
    const outcome = outcomeOf(error);
    if (outcome === "stop") {
      result.kept.push(...items.slice(i));
      break;
    }
    if (outcome === "keep") {
      result.kept.push(item);
      continue;
    }
    if (outcome === "done") {
      for (const request of after) await deps.send(request).catch(() => {});
      result.done.push(item);
    }
    else result.refused.push({ item, error });
    await deps.remove(item.key);
  }
  return result;
};
