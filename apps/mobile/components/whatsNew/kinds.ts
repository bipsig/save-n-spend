import type { NoteKind, Release } from "@/data/releaseNotes";
import { countsOf } from "@/lib/whatsNew";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import type { ChipTint } from "@/theme/gradients";
import { colors } from "@/theme";

// Each kind's tint, and the glyph for a note that has none of its own.
export const KIND_LOOK: Record<NoteKind, {
  label: string;
  icon: IconName;
  tint: ChipTint;
  ink: ColorToken;
  soft: string;
}> = {
  new: { label: "New", icon: "sparkles", tint: "violet", ink: "primary", soft: colors.accentSoft },
  improved: { label: "Improved", icon: "income", tint: "teal", ink: "teal", soft: `${colors.teal}26` },
  fixed: { label: "Fixed", icon: "tools", tint: "blue", ink: "info", soft: colors.infoSoft },
};

export const KINDS: NoteKind[] = ["new", "improved", "fixed"];

/** What a quiet release says in place of its notes. */
export const QUIET_SENTENCE = "This one was behind-the-scenes work. Nothing looks different, and there's nothing new to try.";

/** "6 new", "4 improved", … with the empty kinds left out. */
export const countParts = (release: Release): { kind: NoteKind; text: string }[] => {
  const counts = countsOf(release);
  return KINDS.filter((kind) => counts[kind] > 0).map((kind) => ({ kind, text: `${counts[kind]} ${kind}` }));
};
