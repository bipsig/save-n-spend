// The app's one channel for "that happened" — a transient line at the top of the
// screen. Deliberately a store rather than a context hook, so a plain async helper
// in `lib/` can report an outcome without being a component, and so a screen can
// fire one from inside a `.catch()` without threading a callback through.
//
// Kept free of any `api` import, like `store/session` and `store/settings`, so
// nothing here can join an import cycle.
import { create } from 'zustand';
import { haptics } from '@/lib/haptics';

// `warning` is its own tone rather than a shade of `info`: "it saved, but you're
// already over" is a different fact from "it saved", and the app has several of
// them — a budget set below what's spent, an export with nothing in range.
export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface Toast {
  /** Monotonic, so a replacing toast is a new element and re-runs its entrance. */
  id: number;
  tone: ToastTone;
  message: string;
  action?: ToastAction;
}

/** Long enough to read a sentence, short enough not to sit over the content. */
const PLAIN_DURATION_MS = 2800;
/** Longer than the plain duration on purpose: an actionable toast is read, weighed, and
 *  decided on — 2800ms is barely enough to read the sentence, let alone act on it. */
const ACTION_DURATION_MS = 5000;

interface ToastState {
  current: Toast | null;
  show: (tone: ToastTone, message: string, action?: ToastAction) => void;
  dismiss: () => void;
}

let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;

// The haptic that belongs to each tone. Bound here rather than at the call site so
// a toast and its buzz can never disagree — you cannot ship a red banner that
// feels like a success.
const FEEL: Record<ToastTone, () => void> = {
  success: haptics.success,
  error: haptics.error,
  warning: haptics.warning,
  info: haptics.tap,
};

export const useToast = create<ToastState>((set) => ({
  current: null,

  // One at a time. A second toast replaces the first rather than queueing: by the
  // time a queue drained, the action that caused the earlier message would be
  // several taps in the past and the banner would be describing history. An earlier
  // toast's action (e.g. an undo) isn't cancelled by this — whatever it was attached to
  // keeps running on its own clock; only the visible button to trigger it is gone.
  show: (tone, message, action) => {
    if (timer) clearTimeout(timer);
    FEEL[tone]();
    set({ current: { id: nextId++, tone, message, action } });
    timer = setTimeout(() => set({ current: null }), action ? ACTION_DURATION_MS : PLAIN_DURATION_MS);
  },

  dismiss: () => {
    if (timer) clearTimeout(timer);
    timer = null;
    set({ current: null });
  },
}));

// The call-site API. `toast.error(...)` reads as a statement of what happened,
// which is the point — no component needs to know a store is involved.
export const toast = {
  success: (message: string) => useToast.getState().show('success', message),
  error: (message: string) => useToast.getState().show('error', message),
  /** It worked, but read the message — over budget, nothing in range to export. */
  warning: (message: string) => useToast.getState().show('warning', message),
  info: (message: string) => useToast.getState().show('info', message),
  /** Turns an unknown `catch` value into a message, so no call site repeats this. */
  fromError: (err: unknown, fallback: string) =>
    useToast.getState().show('error', err instanceof Error ? err.message : fallback),
  /** An announcement with exactly one thing to do about it — the undo grace window on a
   *  delete, so far the only user of this. Auto-dismisses like every other toast; tapping
   *  the action fires it and dismisses immediately rather than waiting out the timer. */
  action: (tone: ToastTone, message: string, action: ToastAction) =>
    useToast.getState().show(tone, message, action),
} as const;

export default toast;
