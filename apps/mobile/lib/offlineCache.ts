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

const DIR = `${FileSystem.documentDirectory}offline-cache/`;

/** Bumped whenever a cached response shape changes incompatibly — a version mismatch on
 *  read is treated as a miss rather than handed to a hook that isn't expecting it. */
const CACHE_VERSION = 1;

type Entry<T> = { v: number; path: string; fetchedAt: number; data: T };

// A path can carry a query string with characters and a length a filename can't safely
// hold, so the key is a hash of it — collision-checked on read via the real `path` stored
// inside the entry, which is cheaper than a crypto dependency for this.
const keyFor = (path: string): string => {
  let hash = 0x811c9dc5; // FNV-1a, 32-bit
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

const fileFor = (path: string): string => `${DIR}${keyFor(path)}.json`;

const ensureDir = async (): Promise<void> => {
  try {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
  }
  catch {
    // Handled by the caller's own try/catch failing to write — nothing to do here.
  }
};

export const read = async <T>(path: string): Promise<{ data: T; fetchedAt: number } | null> => {
  try {
    const file = fileFor(path);
    const info = await FileSystem.getInfoAsync(file);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(file, { encoding: FileSystem.EncodingType.UTF8 });
    const entry = JSON.parse(raw) as Entry<T>;
    if (entry.v !== CACHE_VERSION || entry.path !== path) return null; // stale shape, or a hash collision
    return { data: entry.data, fetchedAt: entry.fetchedAt };
  }
  catch {
    return null;
  }
};

export const write = async (path: string, data: unknown): Promise<void> => {
  try {
    await ensureDir();
    const entry: Entry<unknown> = { v: CACHE_VERSION, path, fetchedAt: Date.now(), data };
    await FileSystem.writeAsStringAsync(fileFor(path), JSON.stringify(entry), { encoding: FileSystem.EncodingType.UTF8 });
  }
  catch {
    // A day this fails is a day the app falls back to nothing rather than something
    // stale — not worse than never having cached at all.
  }
};

// The outbox lives in the same directory but is excluded here — it's the one thing that
// must survive a sign-out (see store/outbox.ts).
const isOutboxFile = (name: string): boolean => name.startsWith("outbox.");

export const clearAll = async (): Promise<void> => {
  try {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists) return;
    const names = await FileSystem.readDirectoryAsync(DIR);
    await Promise.all(
      names
        .filter((name) => !isOutboxFile(name))
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
  try {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists) return;
    const cutoff = Date.now() - maxAgeMs;
    const names = await FileSystem.readDirectoryAsync(DIR);
    await Promise.all(names.filter((name) => !isOutboxFile(name)).map(async (name) => {
      const file = `${DIR}${name}`;
      try {
        const raw = await FileSystem.readAsStringAsync(file, { encoding: FileSystem.EncodingType.UTF8 });
        const entry = JSON.parse(raw) as Entry<unknown>;
        if (entry.fetchedAt < cutoff) await FileSystem.deleteAsync(file, { idempotent: true });
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
