// Pending deletes on disk, one file per user. Its own directory, so neither the offline
// cache's clear on sign-out nor its pruning can touch it: a confirmed delete must survive a
// sign-out too, and is sent when that user signs in again.
import * as FileSystem from "expo-file-system/legacy";
import type { PersistedDelete } from "@/lib/pendingDeleteReplay";

const DIR = `${FileSystem.documentDirectory}pending-deletes/`;
const fileFor = (userId: string): string => `${DIR}${userId}.json`;

export const readPendingDeletes = async (userId: string): Promise<PersistedDelete[]> => {
  try {
    const file = fileFor(userId);
    if (!(await FileSystem.getInfoAsync(file)).exists) return [];
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(file)) as unknown;
    return Array.isArray(parsed) ? (parsed as PersistedDelete[]) : [];
  }
  catch {
    return [];
  }
};

// One read-change-write at a time, so two deletes scheduled together can't drop each other.
let chain: Promise<unknown> = Promise.resolve();

export const updatePendingDeletes = (userId: string, change: (items: PersistedDelete[]) => PersistedDelete[]): Promise<void> => {
  const run = chain.then(async () => {
    try {
      const next = change(await readPendingDeletes(userId));
      if (!(await FileSystem.getInfoAsync(DIR)).exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
      await FileSystem.writeAsStringAsync(fileFor(userId), JSON.stringify(next));
    }
    catch {
      // The in-memory timer still sends the delete; only the kill-safety is lost.
    }
  });
  chain = run;
  return run;
};
