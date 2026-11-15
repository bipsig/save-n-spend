// When the offline cache must be emptied once, on the first launch of a new app. Kept apart
// from lib/offlineCache.ts so it can be tested without expo-file-system.

/** Raise when a cached response changes shape so the old one must never be read again.
 *  2: 2.8.0, where every page is `{ items, page, limit, hasNextPage, total }`. */
export const RESPONSE_EPOCH = 2;

/** The marker holding the epoch the cache was last cleared for. Lives in the cache directory
 *  and survives sign-out, so the clear runs once per install, not once per session. */
export const EPOCH_FILE = "epoch.json";

/** The offline queue shares the directory and is never cleared (see lib/outbox.ts). */
export const isOutboxFile = (name: string): boolean => name.startsWith("outbox.");

/** Files no cache clear may delete: the queue and the marker. */
export const isKeptFile = (name: string): boolean => isOutboxFile(name) || name === EPOCH_FILE;

export const needsClear = (stored: number | null): boolean => stored === null || stored < RESPONSE_EPOCH;

/** The marker's content, or null when it is missing or unreadable (both mean "clear"). */
export const parseEpoch = (raw: string | null): number | null => {
  if (raw === null) return null;
  try {
    const epoch = (JSON.parse(raw) as { epoch?: unknown }).epoch;
    return typeof epoch === "number" ? epoch : null;
  }
  catch {
    return null;
  }
};

/**
 * Which cache files the one-time clear deletes: every cached response except those in `keep`.
 * `keep` is the signed-in user (`/auth/me`), which is how an offline first launch stays signed
 * in; its shape did not change.
 */
export const filesToClear = (names: string[], keep: string[]): string[] =>
  names.filter((name) => !isKeptFile(name) && !keep.includes(name));
