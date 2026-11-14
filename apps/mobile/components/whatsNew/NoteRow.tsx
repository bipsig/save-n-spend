import { StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import type { ReleaseNote } from "@/data/releaseNotes";
import { firstSentence } from "@/lib/whatsNew";
import { linkDestination } from "@/lib/whatsNewLinks";
import { spacing } from "@/theme";
import { KIND_LOOK } from "./kinds";

export type NoteRowProps = {
  note: ReleaseNote;
  /** `card`: a row inside a version page's section card. `sheet`: the post-update sheet's denser row. */
  variant?: "card" | "sheet";
  /** Defaults to router.push. */
  onOpen?: (href: string) => void;
};

const openHref = (href: string) => router.push(href as Href);

export default function NoteRow({ note, variant = "card", onOpen = openHref }: NoteRowProps) {
  const sheet = variant === "sheet";
  const look = KIND_LOOK[note.kind];
  const title = sheet ? firstSentence(note.title) : note.title;
  const link = note.link;

  const body = (
    <View style={[sheet ? styles.sheetRow : styles.cardRow, !link && styles.top]}>
      {/* Decorative: the glyph is an icon-font character VoiceOver would stop on with no label. */}
      <View
        style={!link && !sheet && styles.chipTop}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Icon
          name={note.icon ?? look.icon}
          size={sheet ? 15 : 17}
          containerSize={sheet ? 28 : 34}
          containerRadius={sheet ? 9 : 11}
          container="square"
          gradient={look.tint}
        />
      </View>
      <View style={styles.text}>
        <AppText size="sm" weight="bold" style={styles.title}>
          {title}
        </AppText>
        {note.detail && (
          <AppText size="xs" color="inkDim" numberOfLines={sheet ? 2 : undefined} style={styles.detail}>
            {note.detail}
          </AppText>
        )}
      </View>
      {link && <Icon name="chevronRight" size={18} color="inkDim" />}
    </View>
  );

  if (!link) return body;

  const destination = linkDestination(link);
  return (
    <PressableScale
      onPress={() => onOpen(link)}
      scaleTo={0.985}
      accessibilityRole="button"
      accessibilityLabel={`${firstSentence(note.title)}. Opens ${destination ?? "the screen it's about"}`}
    >
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  // Without a chevron to centre on, the chip sits beside the first line of a long note.
  top: {
    alignItems: "flex-start",
  },
  chipTop: {
    marginTop: 1,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    lineHeight: 20,
  },
  detail: {
    lineHeight: 17,
  },
});
