import { readJson, removeKey, writeJson } from "@/lib/deviceStore";

// "Seen" state (gaps row 185, decision 16): what this phone has shown or waved away for one
// account, kept on the phone and keyed by that account, so a second account signing in here
// starts fresh, and cleared for the account when it signs out (lib/profile.ts logOut).
// Recurring dismissals are the exception and live on the server (/recurring/dismiss).

/** Every per-account value the app keeps on the phone. Listed once, so sign-out clears all. */
export const SEEN_KEYS = {
  /** Highlights waved away: highlight key → when (lib/highlights). */
  highlights: "sns.seen.highlights",
  /** Get started, the net-worth milestone and the last review banner (store/seen). */
  home: "sns.seen.home",
  /** When this account last opened the app here (store/lastOpened). */
  lastOpened: "sns.seen.lastOpened",
} as const;

export type SeenKey = (typeof SEEN_KEYS)[keyof typeof SEEN_KEYS];

/** The key for one account. SecureStore keys take letters, digits and `._-`; ids are hex. */
export const perUserKey = (key: SeenKey, userId: string): string => `${key}.${userId}`;

/** One per-account value: read and write it for a given account. */
export const perUser = <T,>(key: SeenKey) => ({
  read: (userId: string) => readJson<T>(perUserKey(key, userId)),
  write: (userId: string, value: T) => writeJson(perUserKey(key, userId), value),
});

/** Sign-out: everything this phone kept for the account. */
export const clearPerUser = async (userId: string): Promise<void> => {
  await Promise.all(Object.values(SEEN_KEYS).map((key) => removeKey(perUserKey(key, userId))));
};

/**
 * A value that used to be kept for the whole phone, moved to the first account that reads it
 * after the update (it is that account's, as far as anyone can tell) and then dropped, so the
 * next account doesn't inherit it.
 */
export const adoptLegacy = async <T,>(key: SeenKey, userId: string, legacyKey: string): Promise<T | null> => {
  const own = await readJson<T>(perUserKey(key, userId));
  if (own !== null) return own;
  const legacy = await readJson<T>(legacyKey);
  if (legacy === null) return null;
  await writeJson(perUserKey(key, userId), legacy);
  await removeKey(legacyKey);
  return legacy;
};
