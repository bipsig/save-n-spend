// A keyed write can succeed with no record in the reply: when the server committed the write but
// lost its stored answer, a retry with the same Idempotency-Key gets 200 with `data: null`
// ("This was already saved", header `Idempotent-Replayed: true`). The write happened, so callers
// treat it as success, refetch what the screen shows, and find the record there instead of
// reading the reply. Pure, so it's tested under node (lib/replayed.test.ts).

/**
 * The record a create made: the reply's, or else the one item in the refetched list that
 * matches what was sent. Two candidates mean we can't tell which, so null: saved, but nothing
 * is picked for the user.
 */
export const recoverCreated = <T>(returned: T | null | undefined, refetched: T[], matches: (item: T) => boolean): T | null => {
  if (returned) return returned;
  const found = refetched.filter(matches);
  return found.length === 1 ? found[0] : null;
};

/** Names compare the way the server's unique index does: trimmed, ignoring case. */
export const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();
