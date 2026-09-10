import * as Haptics from "expo-haptics";

// The haptic vocabulary, named by MEANING rather than intensity. A call site says what just
// happened — `haptics.confirm()`, `haptics.error()` — and this file is the only place deciding
// how hard that feels, so re-tuning one gesture is one line here.
//
// Every call is fire-and-forget and swallows its own failure: a device with the Taptic Engine
// off, an Android build without VIBRATE, or the simulator all reject these promises, and a
// missing buzz must never break the action it accompanies.
const fire = (run: () => Promise<void>) => {
  void run().catch(() => {});
};

export const haptics = {
  /** A row, card, or nav target was pressed. The lightest thing in the vocabulary. */
  tap: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),

  /** Moving through a set of choices — chips, segments, pickers, tab bar. */
  select: () => fire(() => Haptics.selectionAsync()),

  /** A switch flipped, or a value committed. Heavier than a tap: state changed. */
  toggle: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),

  /** A primary button that starts real work (save, submit, pay). */
  press: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),

  /** Something irreversible completed — the end of a hold, a delete going through. */
  heavy: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),

  /** It worked. Paired with a success toast, never fired on its own. */
  success: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),

  /** It worked, but read the message — over budget, nothing to export. */
  warning: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),

  /** It failed. The one buzz the user should feel before reading anything. */
  error: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
} as const;

export default haptics;
