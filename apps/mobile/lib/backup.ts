import * as DocumentPicker from "expo-document-picker";
// SDK 54 ships a new file API by default; the classic string helpers we need
// (writeAsStringAsync / readAsStringAsync / cacheDirectory) live under /legacy.
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import type { IUser } from "@save-n-spend/types";
import { get, post } from "@/lib/api";
import { dayStamp } from "@/lib/export";

// The six collections a backup carries — HighlightLog and Notification are excluded
// server-side, since both regenerate from this same data rather than being entered by
// the user. Used only to count what a picked file holds, for the confirm sheet's copy.
const COLLECTIONS = ["accounts", "categories", "transactions", "budgets", "bills", "goals"] as const;

export type BackupCounts = Record<(typeof COLLECTIONS)[number], number>;

export type BackupPayload = Record<string, unknown>;

export type PickedBackup = {
  payload: BackupPayload;
  exportedAt: string;
  counts: BackupCounts;
};

export type RestoreResult = { counts: BackupCounts; user: IUser };

// Fetch the account's full backup and hand it to the OS share sheet as a JSON file —
// the same write-then-share mechanism `lib/export.ts` uses for CSV/PDF.
export const exportBackup = async (): Promise<void> => {
  const backup = await get<BackupPayload>("/backup");
  const uri = `${FileSystem.cacheDirectory}save-n-spend-backup-${dayStamp(new Date())}.json`;
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(backup), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing isn't available on this device.");
  }
  await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Backup" });
};

// Reads and shape-checks the picked file, but restores nothing yet — the caller shows
// a confirm sheet with `counts`/`exportedAt` first, so a bad file never gets as far as
// "are you sure". Returns null on cancel.
export const pickBackupFile = async (): Promise<PickedBackup | null> => {
  const result = await DocumentPicker.getDocumentAsync({ type: "application/json" });
  if (result.canceled) return null;

  const raw = await FileSystem.readAsStringAsync(result.assets[0].uri);
  let payload: BackupPayload;
  try {
    payload = JSON.parse(raw) as BackupPayload;
  }
  catch {
    throw new Error("That file isn't valid JSON.");
  }

  if (payload.version !== 1 || typeof payload.exportedAt !== "string") {
    throw new Error("That doesn't look like a Save n Spend backup file.");
  }

  const counts = Object.fromEntries(
    COLLECTIONS.map((key) => [key, Array.isArray(payload[key]) ? (payload[key] as unknown[]).length : 0])
  ) as BackupCounts;

  return { payload, exportedAt: payload.exportedAt, counts };
};

// No multipart/FormData needed — a backup already IS JSON, so the picked file's parsed
// contents go straight through the app's normal JSON request helper. `confirm: true` is
// the server-side half of the destructive-action guard.
export const restoreBackup = (payload: BackupPayload): Promise<RestoreResult> =>
  post<RestoreResult>("/backup/restore", { ...payload, confirm: true });
