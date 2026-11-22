// The pure half of lib/undo.ts: which request deletes each record, what the toasts say, and
// what an undo's failure means. Tested under node (lib/undo.test.ts).
import { ApiError } from "./apiError";

export const UNDO_COPY = {
  undone: "Back to how it was",
  /** The API's own sentence for a refused If-Match (`MESSAGES.changedSince`). */
  changed: "This changed after you saved it, so it wasn't undone",
  offline: "Couldn't undo — you're offline",
  failed: "Couldn't undo that",
} as const;

export type DeleteTarget = {
  /** `<kind>:<id>`, the key screens filter on. */
  key: string;
  request: { method: "DELETE"; path: string };
};

const target = (key: string, path: string): DeleteTarget => ({ key, request: { method: "DELETE", path } });

/** The key and DELETE for every record the app deletes. */
export const deleteTarget = {
  transaction: (id: string) => target(`transaction:${id}`, `/transactions/${id}`),
  goal: (id: string) => target(`goal:${id}`, `/goals/${id}`),
  bill: (id: string) => target(`bill:${id}`, `/bills/${id}`),
  category: (id: string) => target(`category:${id}`, `/categories/${id}`),
  account: (id: string) => target(`account:${id}`, `/accounts/${id}`),
  budget: (id: string) => target(`budget:${id}`, `/budgets/${id}`),
  trip: (id: string) => target(`trip:${id}`, `/trips/${id}`),
  tripExpense: (tripId: string, id: string) => target(`tripExpense:${id}`, `/trips/${tripId}/expenses/${id}`),
  /** `mode` is the sheet's choice for the money moved in (keep the balances, or undo them). */
  investment: (id: string, mode: "keep" | "undo") => target(`investment:${id}`, `/investments/${id}?mode=${mode}`),
  /** "Back to exact amounts": the Match Splitwise plan's rows go. */
  plan: (tripId: string) => target(`plan:${tripId}`, `/trips/${tripId}/plan`),
};

const counted = ([n, one, many]: [number, string, string]) => `${n} ${n === 1 ? one : many}`;

/** "Goa 2026 deleted", or with what goes with it: "ICICI Pru deleted with 12 payments and
 *  3 value updates". Parts with a count of zero are left out. */
export const deletedMessage = (name: string, parts: [number, string, string][] = []): string => {
  const named = parts.filter(([n]) => n > 0).map(counted);
  if (named.length === 0) return `${name} deleted`;
  const list = named.length === 1 ? named[0] : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  return `${name} deleted with ${list}`;
};

/** What an edit's undo sends: for every key the save sent, the record's value before it. A
 *  key the record didn't have takes `blank` (an emptied note), or is left out when the API
 *  can't clear it. */
export const previousValues = (
  before: object,
  sent: Record<string, unknown>,
  blank: Record<string, unknown> = {},
): Record<string, unknown> => {
  const old = before as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(sent)) {
    if (old[key] !== undefined) out[key] = old[key];
    else if (key in blank) out[key] = blank[key];
  }
  return out;
};

/** Which edits get "Saved · Undo" (docs/mobile-patterns.md, "Edit undo"). */
export const editUndoAllowed = {
  /** Not a split expense or one of its owed transfers: rescaling back can land a paisa off. */
  transaction: (row: { splitGroupId?: string | null }) => !row.splitGroupId,
  /** Only a save that sent the account PATCH alone: undoing a balance correction or a
   *  re-base would add a second adjustment. */
  account: (save: { correctedBalance: boolean; rebased: boolean }) => !save.correctedBalance && !save.rebased,
};

export type UndoOutcome = "undone" | "changed" | "offline" | "failed";

/** What an undo's answer means: null is success. */
export const undoOutcome = (err: unknown): UndoOutcome => {
  if (err === null) return "undone";
  if (err instanceof ApiError && err.status === 0) return "offline";
  if (err instanceof ApiError && err.code === "conflict" && err.reason === UNDO_COPY.changed) return "changed";
  return "failed";
};
