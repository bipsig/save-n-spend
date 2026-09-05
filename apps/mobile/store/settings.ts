// Device-local settings — the half of Settings that describes THIS phone and is
// never sent to the server (spec §10: `security.*` and privacy mode are
// device-local only). Account-level preferences live on the User document and
// change through `lib/profile.ts`.
//
// Kept free of any `api` import, like `store/session`, so nothing here can
// participate in an import cycle: `lib/money` reads this store to mask amounts.
import { create } from 'zustand';
import { readJson, writeJson } from '@/lib/deviceStore';

const STORAGE_KEY = 'sns.deviceSettings';

// Seconds of background time after which the app re-locks. `0` = the moment it
// leaves the foreground, which is the strictest choice a user can make.
export const AUTO_LOCK_DELAYS = [0, 60, 300] as const;
export type AutoLockSeconds = (typeof AUTO_LOCK_DELAYS)[number];

export const autoLockLabel = (seconds: AutoLockSeconds): string =>
  seconds === 0 ? 'Immediately' : seconds === 60 ? 'After 1 min' : 'After 5 min';

export interface DeviceSettings {
  /** Mask every amount as ₹ •••• until it is tapped. */
  privacyMode: boolean;
  /** Require Face ID / fingerprint when the app comes to the foreground. */
  appLock: boolean;
  autoLockSeconds: AutoLockSeconds;
  /**
   * Ids of the users who have waved away the Get started checklist on THIS phone.
   *
   * A list rather than a boolean because the flag is device-local but the checklist
   * is per-account: two people signing in on the same phone must not inherit each
   * other's dismissal, and the one who loses out would be the new user who needs it.
   * Every other completion signal is derived from server data — this is the only bit
   * of onboarding state worth storing, because "I don't want budgets" is a preference
   * and nothing on the server records it.
   */
  getStartedDismissed: string[];
}

const DEFAULTS: DeviceSettings = {
  privacyMode: false,
  appLock: false,
  autoLockSeconds: 60,
  getStartedDismissed: [],
};

/**
 * How long a peek lasts. Long enough to read a screenful and do the arithmetic
 * you opened it for, short enough that putting the phone down re-hides it for you
 * — the whole point of privacy mode is not having to remember.
 */
export const PEEK_MS = 10_000;

interface SettingsState extends DeviceSettings {
  /** False until the stored blob has been read, so the lock gate doesn't decide early. */
  hydrated: boolean;
  /**
   * Amounts are temporarily readable. Deliberately NOT persisted and not part of
   * `DeviceSettings`: a peek is a moment, and it must never survive the app being
   * reopened — otherwise privacy mode would silently be off.
   */
  peeking: boolean;
  hydrate: () => Promise<void>;
  update: (patch: Partial<DeviceSettings>) => void;
  /** Reveal every amount for `PEEK_MS`. Tapping again while open restarts the clock. */
  peek: () => void;
  /** Re-mask now, without waiting out the timer. */
  hide: () => void;
}

// Module-level, like the toast timer: one peek at a time, and a restart has to be
// able to clear the previous countdown rather than race it.
let peekTimer: ReturnType<typeof setTimeout> | null = null;

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,
  peeking: false,

  // On app start: pull the saved blob over the defaults. Unknown or missing keys
  // keep their default, so adding a setting later doesn't invalidate what's stored.
  hydrate: async () => {
    const stored = await readJson<Partial<DeviceSettings>>(STORAGE_KEY);
    set({ ...DEFAULTS, ...stored, hydrated: true });
  },

  // Optimistic: state moves first so a toggle flips under the finger, then the
  // whole blob is written. Persisting the blob rather than the one changed key
  // keeps the stored shape identical to the state's.
  update: (patch) => {
    set(patch);
    const { privacyMode, appLock, autoLockSeconds, getStartedDismissed } = get();
    void writeJson(STORAGE_KEY, { privacyMode, appLock, autoLockSeconds, getStartedDismissed });
    // Switching privacy mode off makes a standing peek meaningless, and switching it
    // ON must not leave one running — that would mask nothing and look broken.
    if (patch.privacyMode !== undefined) get().hide();
  },

  peek: () => {
    if (peekTimer) clearTimeout(peekTimer);
    set({ peeking: true });
    peekTimer = setTimeout(() => {
      peekTimer = null;
      set({ peeking: false });
    }, PEEK_MS);
  },

  hide: () => {
    if (peekTimer) clearTimeout(peekTimer);
    peekTimer = null;
    set({ peeking: false });
  },
}));
