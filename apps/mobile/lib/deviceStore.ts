// Persistence for small, non-secret device state — the Settings that describe
// this phone rather than the account (privacy mode, app lock, auto-lock timing).
//
// Through expo-secure-store, already a dependency for the JWT. AsyncStorage is the conventional
// home for non-secrets, but a second native module for one tiny JSON blob buys nothing.
import * as SecureStore from "expo-secure-store";

// Read a JSON blob, returning null when it is absent or has been corrupted by an
// older shape. A settings read must never be able to fail the app's boot, so a
// bad value is treated as "not set" and the caller falls back to defaults.
export const readJson = async <T>(key: string): Promise<T | null> => {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }
  catch {
    return null;
  }
};

export const writeJson = async (key: string, value: unknown): Promise<void> => {
  try {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
  }
  catch {
    // A failed write means the preference doesn't survive a restart. That is not
    // worth interrupting the interaction the user just performed.
  }
};
