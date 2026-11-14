import { useCallback, useEffect, useRef } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { router, type Href } from "expo-router";
import AppSheet from "@/components/sheets/AppSheet";
import Card from "@/components/data/Card";
import { AppText } from "@/components/ui/AppText";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import NoteRow from "./NoteRow";
import type { Release } from "@/data/releaseNotes";
import { highlightsOf } from "@/lib/whatsNew";
import { alsoNewLine, smallerChangesLine } from "@/lib/whatsNewGate";
import { APP_VERSION, useWhatsNew } from "@/store/whatsNew";
import { spacing } from "@/theme";

type Props = {
  release: Release;
  /** Skipped versions, newest first. */
  alsoNew: Release[];
  lastSeen: string | null;
  /** After the sheet has finished leaving, whatever closed it. */
  onDismiss?: () => void;
};

const TIMELINE = "/whats-new";

// The once-per-version sheet after an update. It presents itself on mount, so mounting it is
// the decision to show it (see WhatsNewHost). Every way out counts as seen.
const WhatsNewSheet = ({ release, alsoNew, lastSeen, onDismiss }: Props) => {
  const ref = useRef<BottomSheetModal>(null);
  const seenRef = useRef(false);
  const title = `What's new in ${APP_VERSION}`;

  useEffect(() => {
    ref.current?.present();
    AccessibilityInfo.announceForAccessibility(title);
  }, [title]);

  const seen = useCallback(() => {
    if (seenRef.current) return;
    seenRef.current = true;
    useWhatsNew.getState().markSeen(APP_VERSION);
  }, []);

  // Seen before the close starts: a programmatic dismiss can skip its completion callback.
  const close = () => {
    seen();
    ref.current?.dismiss();
  };

  const open = (href: string) => {
    close();
    router.push(href as Href);
  };

  const handleDismiss = useCallback(() => {
    seen();
    onDismiss?.();
  }, [seen, onDismiss]);

  const highlights = highlightsOf(release);
  const smaller = smallerChangesLine(release.notes.length, highlights.length);
  const skipped = lastSeen && alsoNew.length > 0
    ? alsoNewLine(lastSeen, alsoNew.map((r) => r.version))
    : null;

  return (
    <AppSheet ref={ref} onDismiss={handleDismiss}>
      <View style={styles.identity}>
        <Icon name="sparkles" size={24} containerSize={52} container="square" gradient="violet" />
        <View style={styles.identityText}>
          <AppText size="md" weight="black" accessibilityRole="header">
            {title}
          </AppText>
          <AppText size="sm" color="inkDim">
            {release.headline}
          </AppText>
        </View>
      </View>

      {highlights.length > 0 && (
        <View style={styles.highlights}>
          {highlights.map((note) => (
            <NoteRow key={note.title} note={note} variant="sheet" onOpen={open} />
          ))}
        </View>
      )}

      {smaller && (
        <AppText size="xs" color="inkDim">
          {smaller}
        </AppText>
      )}

      {skipped && (
        <Card padded={false} style={styles.skippedCard}>
          <PressableScale
            onPress={() => open(TIMELINE)}
            scaleTo={0.985}
            accessibilityRole="button"
            accessibilityLabel={`${skipped}. Opens all versions`}
            style={styles.skippedRow}
          >
            <Icon name="restore" size={15} containerSize={28} containerRadius={9} container="square" containerColor="surface2" />
            <AppText size="sm" weight="bold" style={styles.grow}>
              {skipped}
            </AppText>
            <Icon name="chevronRight" size={18} color="inkDim" />
          </PressableScale>
        </Card>
      )}

      <View style={styles.actions}>
        <Button label="Got it" onPress={close} accessibilityRole="button" accessibilityLabel="Got it" />
        <Button
          label="See all versions"
          variant="ghost"
          onPress={() => open(TIMELINE)}
          accessibilityRole="button"
          accessibilityLabel="See all versions"
        />
      </View>
    </AppSheet>
  );
};

const styles = StyleSheet.create({
  identity: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  highlights: {
    gap: 14,
  },
  skippedCard: {
    paddingVertical: 2,
  },
  skippedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  grow: {
    flex: 1,
  },
  actions: {
    gap: spacing.sm,
    marginTop: 2,
  },
});

export default WhatsNewSheet;
