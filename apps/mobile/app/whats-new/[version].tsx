import { StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import EmptyState from "@/components/states/EmptyState";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import NoteSection from "@/components/whatsNew/NoteSection";
import VersionBand from "@/components/whatsNew/VersionBand";
import { compareVersions, previousRelease, releaseFor, sectionsOf, shortVersion } from "@/lib/whatsNew";
import { APP_VERSION } from "@/store/whatsNew";
import { colors, spacing } from "@/theme";

// One version's notes: the band, then New / Improved / Fixed, then a step back to the
// version before it.
const VersionScreen = () => {
  const { version = "" } = useLocalSearchParams<{ version: string }>();
  const release = releaseFor(version);
  const previous = release ? previousRelease(release.version) : undefined;

  const header = { title: release?.version ?? "What's new", back: true } as const;

  if (!release) {
    return (
      <ScreenScaffold {...header}>
        <EmptyState icon="sparkles" title="No notes for this version" subtitle="Every version's notes are in What's new." />
      </ScreenScaffold>
    );
  }

  const sections = release.quiet ? [] : sectionsOf(release);
  const short = previous ? shortVersion(previous.version) : "";

  return (
    <ScreenScaffold {...header}>
      <VersionBand release={release} current={compareVersions(release.version, APP_VERSION) === 0} />

      {sections.map((section, i) => (
        // Keyed by version so stepping to the previous version starts every section folded.
        <NoteSection key={`${release.version}-${section.kind}`} kind={section.kind} notes={section.notes} first={i === 0} />
      ))}

      {previous && (
        <PressableScale
          onPress={() => router.replace(`/whats-new/${previous.version}`)}
          scaleTo={0.985}
          accessibilityRole="button"
          accessibilityLabel={`Previous version, ${previous.version}, ${previous.headline}`}
          style={styles.previous}
        >
          <Card padded={false} style={styles.previousCard}>
            <View style={styles.previousRow}>
              <View style={styles.versionChip}>
                <AppText size="xs" weight="black" style={short.length > 4 ? styles.chipTextLong : styles.chipText}>
                  {short}
                </AppText>
              </View>
              <View style={styles.previousText}>
                <AppText size="xs" color="inkDim">Previous version</AppText>
                <AppText size="sm" weight="bold" numberOfLines={1}>{previous.headline}</AppText>
              </View>
              <Icon name="chevronRight" size={18} color="inkDim" />
            </View>
          </Card>
        </PressableScale>
      )}
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  previous: {
    marginTop: spacing.xs,
  },
  previousCard: {
    paddingVertical: 2,
  },
  previousRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  versionChip: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipText: {
    fontSize: 12.5,
  },
  chipTextLong: {
    fontSize: 10.5,
  },
  previousText: {
    flex: 1,
    gap: 2,
  },
});

export default VersionScreen;
