import { Fragment, useState } from "react";
import { StyleSheet, View } from "react-native";
import Card from "@/components/data/Card";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import type { NoteKind, ReleaseNote } from "@/data/releaseNotes";
import { foldNotes } from "@/lib/whatsNew";
import { colors, spacing } from "@/theme";
import { KIND_LOOK } from "./kinds";
import NoteRow from "./NoteRow";

// One kind's notes on a version page: a caps label over a card of rows. A long section
// shows its first five and opens the rest in place.
const NoteSection = ({ kind, notes, first }: { kind: NoteKind; notes: ReleaseNote[]; first: boolean }) => {
  const [expanded, setExpanded] = useState(false);
  const { shown, hidden } = foldNotes(notes, expanded);
  const look = KIND_LOOK[kind];

  return (
    <>
      <AppText size="xs" weight="bold" color="inkDim" style={[styles.caps, first && styles.capsFirst]}>
        {look.label.toUpperCase()}
      </AppText>
      <Card padded={false} style={styles.card}>
        {shown.map((note, i) => (
          <Fragment key={`${i}-${note.title}`}>
            {i > 0 && <View style={styles.divider} />}
            <NoteRow note={note} />
          </Fragment>
        ))}
        {hidden > 0 && (
          <>
            <View style={styles.divider} />
            <PressableScale
              onPress={() => setExpanded(true)}
              scaleTo={0.985}
              accessibilityRole="button"
              accessibilityLabel={`Show ${hidden} more ${look.label.toLowerCase()} notes`}
            >
              <View style={styles.more}>
                <View style={styles.moreChip}>
                  <Icon name="chevronDown" size={17} color="primary" />
                </View>
                <AppText size="sm" weight="bold" color="primary">
                  {`Show ${hidden} more`}
                </AppText>
              </View>
            </PressableScale>
          </>
        )}
      </Card>
    </>
  );
};

const styles = StyleSheet.create({
  caps: {
    letterSpacing: 1.5,
    paddingHorizontal: 2,
    marginTop: spacing.xs,
  },
  capsFirst: {
    marginTop: 0,
  },
  card: {
    paddingVertical: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.lineSoft,
  },
  more: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  moreChip: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
});

export default NoteSection;
