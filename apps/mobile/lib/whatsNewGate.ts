// When the post-update sheet may appear, and its two composed lines. Pure, so the rule is
// tested without React; components/whatsNew/WhatsNewHost gathers the inputs.
import { shortVersion } from "./whatsNew";

export interface SheetGate {
  /** The What's new store is hydrated and has a sheet for this version. */
  hasSheet: boolean;
  signedIn: boolean;
  /** The App Lock screen is up, or may still come up for this launch. */
  locked: boolean;
  /** The waking screen has opened. */
  awake: boolean;
  inTour: boolean;
  /** On one of the main tabs, not a pushed screen, a modal or an auth screen. */
  onTabs: boolean;
}

export const showsSheet = (g: SheetGate): boolean =>
  g.hasSheet && g.signedIn && !g.locked && g.awake && !g.inTour && g.onTabs;

/** "And 7 smaller changes", or null when every note is already shown. */
export const smallerChangesLine = (total: number, shown: number): string | null => {
  const n = total - shown;
  if (n <= 0) return null;
  return `And ${n} smaller ${n === 1 ? "change" : "changes"}`;
};

/** "Also new since 2.4: 2.5.0", versions newest first as given. */
export const alsoNewLine = (lastSeen: string, versions: string[]): string =>
  `Also new since ${shortVersion(lastSeen)}: ${versions.join(", ")}`;
