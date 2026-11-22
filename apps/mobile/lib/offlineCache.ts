// The last-known answer to every GET this app makes, so a screen has something to show
// the moment the server can't be reached rather than an empty or broken one.
//
// documentDirectory, not cacheDirectory: iOS is free to purge the cache directory under
// storage pressure, which would silently blank the offline experience it exists for.
// expo-file-system is already a dependency (see lib/export.ts) — this is the same
// `/legacy` string-based API, just reading and writing JSON instead of CSV/PDF.
//
// Every method swallows its own errors. A cache failure must never fail the request it
// was only ever meant to help.
import * as FileSystem from "expo-file-system/legacy";
import { EPOCH_FILE, RESPONSE_EPOCH, filesToClear, isKeptFile, needsClear, parseEpoch } from "@/lib/cacheEpoch";

const DIR = `${FileSystem.documentDirectory}offline-cache/`;

/** Bumped whenever a cached response shape changes incompatibly — a version mismatch on
 *  read is treated as a miss rather than handed to a hook that isn't expecting it. */
const CACHE_VERSION = 1;

/** `owner` is the user id the copy was fetched for (gaps row 179, lib/cacheOwner). Entries
 *  written before 2.8.6 have none and are never served. */
type Entry<T> = { v: number; path: string; owner?: string; fetchedAt: number; data: T };

// A path can carry a query string with characters and a length a filename can't safely
// hold, so the key is a hash of it — collision-checked on read via the real `path` and
// `owner` stored inside the entry, which is cheaper than a crypto dependency for this.
const keyFor = (text: string): string => {
  let hash = 0x811c9dc5; // FNV-1a, 32-bit
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

const fileFor = (path: string, owner: string): string => `${DIR}${keyFor(`${owner} ${path}`)}.json`;
/** Where 2.8.5 and earlier kept a path, for any user. */
const legacyFileFor = (path: string): string => `${DIR}${keyFor(path)}.json`;

const readEntry = async <T>(file: string): Promise<Entry<T> | null> => {
  const info = await FileSystem.getInfoAsync(file);
  if (!info.exists) return null;
  return JSON.parse(await FileSystem.readAsStringAsync(file, { encoding: FileSystem.EncodingType.UTF8 })) as Entry<T>;
};

const ensureDir = async (): Promise<void> => {
  try {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
  }
  catch {
    // Handled by the caller's own try/catch failing to write — nothing to do here.
  }
};

// Once per install of an app whose cached shapes changed (see lib/cacheEpoch.ts): every read,
// write and clear waits for it, so nothing cached by the previous app is read, and nothing this
// one caches is deleted by it. A failure leaves the marker unwritten, so the next launch retries.
let upgrade: Promise<void> | null = null;
const upgradeOnce = (): Promise<void> => (upgrade ??= (async () => {
  try {
    const marker = `${DIR}${EPOCH_FILE}`;
    const info = await FileSystem.getInfoAsync(marker);
    const raw = info.exists ? await FileSystem.readAsStringAsync(marker, { encoding: FileSystem.EncodingType.UTF8 }) : null;
    if (!needsClear(parseEpoch(raw))) return;

    await ensureDir();
    const names = await FileSystem.readDirectoryAsync(DIR);
    // Whoever is signed in keeps their saved `/auth/me`, under either key.
    const keep = await Promise.all(names.map(async (name) => {
      try {
        return (await readEntry(`${DIR}${name}`))?.path === "/auth/me" ? name : null;
      }
      catch {
        return null;
      }
    }));
    await Promise.all(
      filesToClear(names, keep.filter((n): n is string => n !== null))
        .map((name) => FileSystem.deleteAsync(`${DIR}${name}`, { idempotent: true }))
    );
    await FileSystem.writeAsStringAsync(marker, JSON.stringify({ epoch: RESPONSE_EPOCH }), { encoding: FileSystem.EncodingType.UTF8 });
  }
  catch {
    // Retried on the next launch.
  }
})());

/** The copy of `path` saved for `owner`, or null. With no owner (no readable session) nothing
 *  is served. */
export const read = async <T>(path: string, owner: string | null): Promise<{ data: T; fetchedAt: number } | null> => {
  await upgradeOnce();
  if (!owner) return null;
  try {
    const entry = await readEntry<T>(fileFor(path, owner));
    if (entry && entry.v === CACHE_VERSION && entry.path === path && entry.owner === owner) {
      return { data: entry.data, fetchedAt: entry.fetchedAt };
    }
    // The one older entry whose owner can be proved: a saved `/auth/me` is the user it is for.
    // Without it, the first launch of 2.8.6 with no signal would have no session to show.
    if (path === "/auth/me") {
      const legacy = await readEntry<{ _id?: string }>(legacyFileFor(path));
      if (legacy && legacy.v === CACHE_VERSION && legacy.path === path && !legacy.owner && String(legacy.data?._id ?? "").toLowerCase() === owner) {
        return { data: legacy.data as T, fetchedAt: legacy.fetchedAt };
      }
    }
    return null; // missing, stale shape, someone else's, or a hash collision
  }
  catch {
    return null;
  }
};

export const write = async (path: string, data: unknown, owner: string | null): Promise<void> => {
  await upgradeOnce();
  if (!owner) return;
  try {
    await ensureDir();
    const entry: Entry<unknown> = { v: CACHE_VERSION, path, owner, fetchedAt: Date.now(), data };
    await FileSystem.writeAsStringAsync(fileFor(path, owner), JSON.stringify(entry), { encoding: FileSystem.EncodingType.UTF8 });
  }
  catch {
    // A day this fails is a day the app falls back to nothing rather than something
    // stale — not worse than never having cached at all.
  }
};

// The outbox lives in the same directory but is excluded here — it's the one thing that
// must survive a sign-out (see store/outbox.ts). So is the epoch marker.
export const clearAll = async (): Promise<void> => {
  await upgradeOnce();
  try {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists) return;
    const names = await FileSystem.readDirectoryAsync(DIR);
    await Promise.all(
      names
        .filter((name) => !isKeptFile(name))
        .map((name) => FileSystem.deleteAsync(`${DIR}${name}`, { idempotent: true }))
    );
  }
  catch {
    // Nothing to clean up, or nothing we can do about it — either way, safe to ignore.
  }
};

/** Garbage-collects the long tail of one-off keys (every debounced search term makes
 *  one) rather than special-casing them — anything untouched past `maxAgeMs` goes. */
export const prune = async (maxAgeMs: number): Promise<void> => {
  await upgradeOnce();
  try {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists) return;
    const cutoff = Date.now() - maxAgeMs;
    const names = await FileSystem.readDirectoryAsync(DIR);
    await Promise.all(names.filter((name) => !isKeptFile(name)).map(async (name) => {
      const file = `${DIR}${name}`;
      try {
        const raw = await FileSystem.readAsStringAsync(file, { encoding: FileSystem.EncodingType.UTF8 });
        const entry = JSON.parse(raw) as Entry<unknown>;
        // An entry with no owner (2.8.5 and earlier) is never served again, whatever its age;
        // the saved `/auth/me` is spared while its read can still adopt it.
        const unowned = !entry.owner && entry.path !== "/auth/me";
        if (unowned || entry.fetchedAt < cutoff) await FileSystem.deleteAsync(file, { idempotent: true });
      }
      catch {
        // An unreadable entry is exactly the kind of thing pruning should remove.
        await FileSystem.deleteAsync(file, { idempotent: true }).catch(() => {});
      }
    }));
  }
  catch {
    // Pruning is housekeeping, not correctness — skip this pass, try again next boot.
  }
};
