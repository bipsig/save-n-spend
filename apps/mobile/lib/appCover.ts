import type { AppStateStatus } from "react-native";

/**
 * Whether the plain cover goes up for this app state (gaps row 41). iOS takes the app-switcher
 * snapshot as the app turns `inactive`, before `background` and long before the lock goes up
 * on return, so with App Lock or privacy mode on the cover must be drawn on `inactive`. The
 * biometric prompt also turns the app inactive; it is left alone so the prompt has the lock
 * screen behind it.
 */
export const coversScreen = (
  next: AppStateStatus,
  s: { authed: boolean; appLock: boolean; privacyMode: boolean; prompting: boolean },
): boolean => s.authed && !s.prompting && (s.appLock || s.privacyMode) && (next === "inactive" || next === "background");
