import { useConnectivity } from "@/store/connectivity";
import type { IconName } from "@/lib/icons";

export const NEEDS_CONNECTION = "Needs a connection";

export type OnlineGate = {
  /** False while offline: the button is disabled, so the tap never happens. */
  allowed: boolean;
  /** The button's own label, offline too, so it still says which action it is. */
  label: string;
  /** `cloudOff` while offline; otherwise the button keeps its own icon (`gate.icon ?? "plus"`). */
  icon: IconName | undefined;
  /** "Needs a connection" while offline: Button's `hint`, drawn under the label and read after it. */
  hint: string | undefined;
};

export const onlineGate = (offline: boolean, label: string): OnlineGate =>
  offline
    ? { allowed: false, label, icon: "cloudOff", hint: NEEDS_CONNECTION }
    : { allowed: true, label, icon: undefined, hint: undefined };

/** What VoiceOver reads for a button with a hint: "Edit, needs a connection". */
export const hintedLabel = (label: string, hint: string | undefined): string =>
  hint ? `${label}, ${hint.charAt(0).toLowerCase()}${hint.slice(1)}` : label;

/** For a write that doesn't queue offline (everything except adding a transaction, which
 *  store/outbox.ts holds): it says so on the button before the tap, as the export sheets do.
 *  It comes back by itself when a request or the 30 s re-check reaches the server. */
export const useOnlineGate = (label: string): OnlineGate => onlineGate(useConnectivity((s) => s.offline), label);
