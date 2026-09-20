// The offline write queue's persistence — one JSON file per signed-in user, in the same
// directory the read cache uses (see lib/offlineCache.ts), but never touched by that
// cache's own clearAll(): a queued transaction must survive a sign-out the user didn't
// choose (a 401 while offline-authed on stale data — see app/_layout.tsx's boot flow)
// just as much as one they did.
import * as FileSystem from "expo-file-system/legacy";

const DIR = `${FileSystem.documentDirectory}offline-cache/`;

export type OutboxItem = {
  clientId: string;
  payload: Record<string, unknown>;
  createdAt: number;
  status: "queued" | "failed";
  error?: string;
};

const fileFor = (userId: string): string => `${DIR}outbox.${userId}.json`;

const ensureDir = async (): Promise<void> => {
  try {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
  }
  catch {
    // Handled by the caller's own write failing — nothing to do here.
  }
};

export const readOutbox = async (userId: string): Promise<OutboxItem[]> => {
  try {
    const file = fileFor(userId);
    const info = await FileSystem.getInfoAsync(file);
    if (!info.exists) return [];
    const raw = await FileSystem.readAsStringAsync(file, { encoding: FileSystem.EncodingType.UTF8 });
    return JSON.parse(raw) as OutboxItem[];
  }
  catch {
    return [];
  }
};

export const writeOutbox = async (userId: string, items: OutboxItem[]): Promise<void> => {
  try {
    await ensureDir();
    await FileSystem.writeAsStringAsync(fileFor(userId), JSON.stringify(items), { encoding: FileSystem.EncodingType.UTF8 });
  }
  catch {
    // A failed write here is the one failure this whole feature exists to prevent, but
    // there's nowhere to surface it from a background persistence call — the caller
    // (store/outbox.ts) keeps its in-memory copy as the source of truth until the next
    // successful write.
  }
};
