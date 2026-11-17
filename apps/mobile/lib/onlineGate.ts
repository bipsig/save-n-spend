import { useConnectivity } from "@/store/connectivity";
import type { IconName } from "@/lib/icons";

export const NEEDS_CONNECTION = "Needs a connection";

export type OnlineGate = {
  /** False while offline: the button is disabled, so the tap never happens. */
  allowed: boolean;
  /** The button's own label, or "Needs a connection". */
  label: string;
  /** `cloudOff` while offline; otherwise the button keeps its own icon (`gate.icon ?? "plus"`). */
  icon: IconName | undefined;
};

export const onlineGate = (offline: boolean, label: string): OnlineGate =>
  offline ? { allowed: false, label: NEEDS_CONNECTION, icon: "cloudOff" } : { allowed: true, label, icon: undefined };

/** For a write that doesn't queue offline (everything except adding a transaction, which
 *  store/outbox.ts holds): it says so on the button before the tap, as the export sheets do.
 *  It comes back by itself when a request or the 30 s re-check reaches the server. */
export const useOnlineGate = (label: string): OnlineGate => onlineGate(useConnectivity((s) => s.offline), label);
