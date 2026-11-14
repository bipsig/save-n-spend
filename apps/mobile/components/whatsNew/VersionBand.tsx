import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Card from "@/components/data/Card";
import { AppText } from "@/components/ui/AppText";
import type { Release } from "@/data/releaseNotes";
import { formatReleaseDate } from "@/lib/whatsNew";
import { TRIP_GRADIENTS } from "@/lib/trips";
import { gradients, radius, spacing } from "@/theme";
import { KIND_LOOK, QUIET_SENTENCE, countParts } from "./kinds";
import Tag from "./Tag";

// The head of a version page: a gradient band with the headline (a trip card's band),
// then the date, build and counts. A quiet release gets the calmer blue band and one
// sentence instead of counts.
const VersionBand = ({ release, current }: { release: Release; current: boolean }) => {
  const quiet = !!release.quiet;
  return (
    <Card padded={false}>
      <LinearGradient
        colors={quiet ? TRIP_GRADIENTS.ocean : gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.band}
      >
        <AppText size="lg" weight="black" style={styles.headline}>
          {release.headline}
        </AppText>
        {current && <Tag label="YOU'RE ON THIS" tone="band" />}
      </LinearGradient>
      <View style={[styles.body, quiet && styles.quietBody]}>
        <AppText size="sm" weight="bold">
          {formatReleaseDate(release.date)}
          <AppText size="xs" weight="medium" color="inkDim">{` · build ${release.build}`}</AppText>
        </AppText>
        {quiet ? (
          <AppText size="sm" color="inkSecondary" style={styles.sentence}>
            {QUIET_SENTENCE}
          </AppText>
        ) : (
          <View style={styles.counts}>
            {countParts(release).map(({ kind, text }) => (
              <View key={kind} style={[styles.count, { backgroundColor: KIND_LOOK[kind].soft }]}>
                <AppText size="xs" weight="bold" color={KIND_LOOK[kind].ink} style={styles.countText}>
                  {text}
                </AppText>
              </View>
            ))}
          </View>
        )}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  band: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  headline: {
    flex: 1,
    lineHeight: 28,
  },
  body: {
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  quietBody: {
    gap: spacing.sm,
    paddingBottom: 16,
  },
  sentence: {
    lineHeight: 20,
  },
  counts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  count: {
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: radius.full,
  },
  countText: {
    fontSize: 12,
  },
});

export default VersionBand;
