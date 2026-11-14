import { useEffect, useState } from "react";
import { useSegments } from "expo-router";
import WhatsNewSheet from "./WhatsNewSheet";
import { useAppLock } from "@/components/shell/AppLockGate";
import type { Release } from "@/data/releaseNotes";
import { showsSheet } from "@/lib/whatsNewGate";
import { useSession } from "@/store/session";
import { useWake } from "@/store/wake";
import { APP_VERSION, useWhatsNewState } from "@/store/whatsNew";

type Shown = { release: Release; alsoNew: Release[]; lastSeen: string | null };

// Mounted once, in the root layout. Holds the post-update sheet back until the user is on the
// tabs with nothing else in the way, then shows it once; marking it seen makes `sheet` null.
const WhatsNewHost = () => {
  const { sheet, lastSeen } = useWhatsNewState(APP_VERSION);
  const status = useSession((s) => s.status);
  const locked = useAppLock((s) => s.locked);
  const awake = useWake((s) => s.phase === "awake");
  const [group, screen] = useSegments() as string[];

  const show = showsSheet({
    hasSheet: sheet !== null,
    signedIn: status === "authed",
    locked: locked !== false,
    awake,
    inTour: group === "(auth)" && screen === "welcome",
    onTabs: group === "(tabs)",
  });

  // A copy, so the sheet keeps its content while it slides away after markSeen clears `sheet`.
  const [shown, setShown] = useState<Shown | null>(null);
  useEffect(() => {
    if (show && sheet && !shown) setShown({ ...sheet, lastSeen });
  }, [show, sheet, shown, lastSeen]);

  if (!shown) return null;
  return <WhatsNewSheet {...shown} onDismiss={() => setShown(null)} />;
};

export default WhatsNewHost;
