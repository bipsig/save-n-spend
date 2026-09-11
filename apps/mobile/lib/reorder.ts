import { patch } from "@/lib/api";

/**
 * `list` with the members of `ids` rearranged into that order, everything else untouched.
 *
 * The slots the set occupies are refilled front to back rather than the set being lifted out
 * and reinserted: the category store is one flat list holding both kinds and both levels, and
 * only ever one sibling set is being reordered. Refilling in place leaves every other row —
 * another parent's children, the other kind — exactly where it was.
 */
export const applyOrder = <T extends { _id: string }>(list: T[], ids: string[]): T[] => {
  const moving = new Set(ids);
  const inOrder = ids
    .map((id) => list.find((item) => item._id === id))
    .filter((item): item is T => item !== undefined);

  // An id that isn't in the list would leave a hole. Nothing rather than a broken list.
  if (inOrder.length !== list.filter((item) => moving.has(item._id)).length) return list;

  let next = 0;
  return list.map((item) => (moving.has(item._id) ? inOrder[next++] : item));
};

let queue: Promise<unknown> = Promise.resolve();

/**
 * PATCHes an order, one request at a time app-wide.
 *
 * Reordering is a burst of taps and each request carries the whole set as absolute positions,
 * so with two in flight a stale one can land last and overwrite the order the user actually
 * left. Chained rather than per-endpoint because these are a handful of tiny writes and one
 * chain saves categories and accounts each keeping their own copy of this reasoning.
 */
export const persistOrder = async (path: string, ids: string[]): Promise<void> => {
  // A failed write must not break the chain for the next one.
  const write = queue.catch(() => {}).then(() => patch<{ reordered: number }>(path, { ids }));
  queue = write.catch(() => {});
  await write;
};
