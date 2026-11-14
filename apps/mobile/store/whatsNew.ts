// Which version's notes this phone has seen, for the post-update sheet and the NEW tag in
// Settings. Device-local like store/settings: it's about the app installed here.
//
// Kept in SecureStore (lib/deviceStore) like every other device flag. Each update is a
// delete-and-reinstall through SideStore, which wipes the app's files but not its Keychain,
// so nothing kept on disk would survive to the next version.
import { useMemo } from "react";
import Constants from "expo-constants";
import { create } from "zustand";
import { readJson, writeJson } from "@/lib/deviceStore";
import { getToken } from "@/lib/secure";
import { compareVersions, previousRelease, sheetFor, showsNewTag } from "@/lib/whatsNew";

const STORAGE_KEY = "sns.whatsNew";

/** The native app version, as the Settings Version row shows it. */
export const APP_VERSION = Constants.expoConfig?.version ?? "0.0.0";

// Written by 2.6.0 and earlier, so finding any of them means this phone ran the app before
// this store existed. lastOpenedAt (store/lastOpened) is written on every signed-in launch
// and kept through sign-out; lastOnlineAt (store/connectivity) on any answer from the
// server, signed in or not; deviceSettings (store/settings) once a setting is changed.
const PRIOR_USE_KEYS = ["sns.lastOpenedAt", "sns.lastOnlineAt", "sns.deviceSettings"];

const usedBefore = async (): Promise<boolean> => {
  if (await getToken().catch(() => null)) return true;
  const found = await Promise.all(PRIOR_USE_KEYS.map((key) => readJson<unknown>(key)));
  return found.some((value) => value !== null);
};

interface WhatsNewState {
  lastSeenVersion: string | null;
  /** True for the launch that found no trace of an earlier install. */
  freshInstall: boolean;
  hydrated: boolean;
  /**
   * Call once at boot, before anything signed-in runs: the prior-use keys it reads start
   * being written as soon as a session opens.
   */
  hydrate: (currentVersion: string) => Promise<void>;
  /** Never moves backwards. */
  markSeen: (version: string) => void;
}

let hydrating: Promise<void> | null = null;

export const useWhatsNew = create<WhatsNewState>((set, get) => ({
  lastSeenVersion: null,
  freshInstall: false,
  hydrated: false,

  hydrate: (currentVersion) => {
    hydrating ??= (async () => {
      const stored = await readJson<{ lastSeenVersion?: string }>(STORAGE_KEY);
      if (stored?.lastSeenVersion) {
        set({ lastSeenVersion: stored.lastSeenVersion, hydrated: true });
        return;
      }
      // First launch with this store. A phone that used the app before is upgrading from
      // the version just before this one, which is the closest guess there is; written
      // down so a later update still knows where this phone started.
      const upgrading = await usedBefore();
      const lastSeenVersion = upgrading ? (previousRelease(currentVersion)?.version ?? null) : currentVersion;
      set({ lastSeenVersion, freshInstall: !upgrading, hydrated: true });
      if (lastSeenVersion) void writeJson(STORAGE_KEY, { lastSeenVersion });
    })();
    return hydrating;
  },

  markSeen: (version) => {
    const seen = get().lastSeenVersion;
    if (seen && compareVersions(version, seen) <= 0) return;
    set({ lastSeenVersion: version });
    void writeJson(STORAGE_KEY, { lastSeenVersion: version });
  },
}));

/** Everything a screen needs. Nothing shows until `hydrated`. */
export const useWhatsNewState = (currentVersion: string) => {
  const hydrated = useWhatsNew((s) => s.hydrated);
  const lastSeen = useWhatsNew((s) => s.lastSeenVersion);
  const freshInstall = useWhatsNew((s) => s.freshInstall);

  return useMemo(() => ({
    hydrated,
    lastSeen,
    freshInstall,
    showNewTag: hydrated && showsNewTag(currentVersion, lastSeen),
    sheet: hydrated ? sheetFor({ current: currentVersion, lastSeen, freshInstall }) : null,
  }), [hydrated, lastSeen, freshInstall, currentVersion]);
};
