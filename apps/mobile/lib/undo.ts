// Undo for deletes and edits, one rule for every record (docs/mobile-patterns.md, "Delete and
// undo").
//
// A delete is held on the phone for the undo window (store/pendingDeletes.ts) and only sent
// when it ends, so a cascade (a trip with its expenses, a holding with its payments) costs
// the same as one row. The key stays hidden until the screens have reloaded without the row,
// so it never flashes back (gaps row 64).
//
// An edit is sent at once; "Undo" sends the previous values back with `If-Match: <updatedAt>`
// from the save, and the server refuses it (409 `conflict`) if the record changed since.
import { useMemo } from "react";
import { del, patch, type RequestOptions } from "@/lib/api";
import { makeIdempotencyKey } from "@/lib/idempotency";
import { invalidateReads, readsChangedBy } from "@/lib/query/invalidate";
import type { ReplayRequest } from "@/lib/pendingDeleteReplay";
import { useConnectivity } from "@/store/connectivity";
import { pendingDeletes, usePendingDeletes } from "@/store/pendingDeletes";
import { toast, type ToastTone } from "@/store/toast";
import { UNDO_COPY, undoOutcome, type DeleteTarget } from "@/lib/undoCopy";

export { UNDO_COPY, deleteTarget, deletedMessage, editUndoAllowed, previousValues, undoOutcome } from "@/lib/undoCopy";

export type DeleteWithUndo = DeleteTarget & {
  /** Named in "Couldn't delete <label> — it's back". */
  label: string;
  /** The toast: "Goa 2026 deleted with 14 expenses". */
  message: string;
  /** Sent after the DELETE lands, and kept on disk for a replay (clearing a default). */
  after?: ReplayRequest[];
  /** Sends `after` itself, when the app has its own call for it (one that updates the session). */
  afterDelete?: () => Promise<unknown>;
  /** Reloads beyond the screens' reads (the account and category stores). Awaited before the
   *  row's key is cleared. */
  reload?: () => Promise<unknown>;
  /** Once everything above is done. */
  onCommitted?: () => void;
};

const quietly = (work: Promise<unknown> | undefined) => (work ?? Promise.resolve()).then(() => {}, () => {});

/** The commit the store runs when the window ends. Exported for the tests. */
export const commitDelete = (o: Pick<DeleteWithUndo, "request" | "after" | "afterDelete" | "reload" | "onCommitted">) =>
  async ({ idempotencyKey }: RequestOptions): Promise<void> => {
    await del(o.request.path, { idempotencyKey, invalidate: false });
    // The DELETE landed: what follows can't make it a failure.
    if (o.afterDelete) await quietly(o.afterDelete());
    else for (const r of o.after ?? []) await quietly(patch(r.path, r.body, { invalidate: false }));
    await Promise.all([quietly(invalidateReads(readsChangedBy(o.request.path))), quietly(o.reload?.())]);
    o.onCommitted?.();
  };

/** Confirmed delete: hides the record now, toasts "<message> · Undo", sends it after 5 s. */
export const deleteWithUndo = (o: DeleteWithUndo): void => {
  pendingDeletes.schedule(o.key, o.label, commitDelete(o), { request: o.request, ...(o.after ? { after: o.after } : {}) });
  toast.action("info", o.message, { label: "Undo", onPress: () => pendingDeletes.cancel(o.key) });
};

const ownId = (item: unknown) => (item as { _id: string })._id;

/** `items` without the ones of `kind` waiting out their undo window. `idOf` for a list whose
 *  record sits inside each item (a budget summary's `budget._id`). */
export const useVisible = <T,>(kind: string, items: T[], idOf: (item: T) => string = ownId): T[] => {
  const keys = usePendingDeletes((s) => s.keys);
  // idOf reads only the item, so a new inline function each render isn't a change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => items.filter((i) => !keys.has(`${kind}:${idOf(i)}`)), [kind, items, keys]);
};

/** Whether one record is waiting out its undo window (a detail page whose record went). */
export const usePendingDelete = (key: string | null): boolean => usePendingDeletes((s) => (key ? s.keys.has(key) : false));

export type EditWithUndo = {
  /** The PATCH the save sent. */
  path: string;
  /** The old value of every key the save sent. */
  previous: Record<string, unknown>;
  /** The save's reply; its `updatedAt` goes in `If-Match`. */
  saved: object | null | undefined;
  /** The toast the screen already shows: "Changes saved — ₹450.00". */
  message: string;
  tone?: ToastTone;
  /** The same reloads the save did, after the undo lands. */
  reload?: () => Promise<unknown>;
};

/** The types don't all name it, but every edited record's reply carries `updatedAt`. */
const updatedAtOf = (saved: object | null | undefined): string | undefined => (saved as { updatedAt?: string } | null | undefined)?.updatedAt;

/** Sends the previous values back. Exported for the tests. */
export const undoEdit = async (o: Pick<EditWithUndo, "path" | "previous" | "saved" | "reload">): Promise<void> => {
  if (useConnectivity.getState().offline) {
    toast.error(UNDO_COPY.offline);
    return;
  }
  try {
    await patch(o.path, o.previous, { ifMatch: updatedAtOf(o.saved), idempotencyKey: makeIdempotencyKey() });
  }
  catch (err) {
    const outcome = undoOutcome(err);
    if (outcome === "failed") toast.fromError(err, UNDO_COPY.failed);
    else toast.error(UNDO_COPY[outcome]);
    return;
  }
  await quietly(o.reload?.());
  toast.info(UNDO_COPY.undone);
};

/** "Changes saved · Undo". Without an `updatedAt` to send (an older API), just the toast. */
export const editWithUndo = (o: EditWithUndo): void => {
  const tone = o.tone ?? "success";
  if (!updatedAtOf(o.saved)) {
    toast[tone](o.message);
    return;
  }
  toast.action(tone, o.message, { label: "Undo", onPress: () => void undoEdit(o) });
};
