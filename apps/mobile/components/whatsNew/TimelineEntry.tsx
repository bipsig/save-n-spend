import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Card from "@/components/data/Card";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import type { Release } from "@/data/releaseNotes";
import { firstSentence, formatReleaseDate, highlightsOf } from "@/lib/whatsNew";
import { colors, radius, spacing } from "@/theme";
import { chipGradients } from "@/theme/gradients";
import { KIND_LOOK, QUIET_SENTENCE, countParts } from "./kinds";
import Tag from "./Tag";

// The timeline's rail sits in the list's 30pt left gutter, centred 15pt in (far enough in
// that the top dot's halo isn't clipped by the scroll view's edge); each dot is placed
// relative to its entry so it lines up with that entry's first line.
export const RAIL_GUTTER = 30;
export const RAIL_CENTRE = 15;

type Dot = "current" | "major" | "patch" | "minor";

const dotFor = (release: Release, top: boolean): Dot => {
  if (top) return "current";
  const [, minor, patch] = release.version.split(".").map(Number);
  if (patch > 0) return "patch";
  return minor === 0 ? "major" : "minor";
};

const DOT_SIZE: Record<Dot, number> = { current: 18, major: 18, minor: 14, patch: 10 };

const Node = ({ dot, lineHeight }: { dot: Dot; lineHeight: number }) => {
  const size = DOT_SIZE[dot];
  const place = { left: RAIL_CENTRE - size / 2 - RAIL_GUTTER, top: lineHeight / 2 - size / 2 };
  if (dot === "current") {
    return (
      <View style={[styles.node, place, styles.currentNode, { width: size, height: size }]}>
        <View style={styles.currentHalo} />
        <LinearGradient
          colors={[...chipGradients.violet]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
        />
      </View>
    );
  }
  return (
    <View
      style={[
        styles.node,
        place,
        { width: size, height: size, borderRadius: size / 2 },
        dot === "major" ? styles.majorNode : dot === "patch" ? styles.patchNode : styles.minorNode,
      ]}
    />
  );
};

export const MonthLabel = ({ label }: { label: string }) => (
  <View style={styles.month}>
    <View style={styles.monthTick} />
    <AppText size="xs" weight="bold" color="inkDim" style={styles.monthText}>
      {label.toUpperCase()}
    </AppText>
  </View>
);

const countsText = (release: Release) => countParts(release).map((p) => p.text).join(", ");

type Props = { release: Release; top: boolean; current: boolean; onPress: () => void };

// Every entry opens its version's page; nothing expands in place. The top one also shows
// date · build and up to three highlights.
const TimelineEntry = ({ release, top, current, onPress }: Props) => {
  const quiet = !!release.quiet;
  const parts = countParts(release);
  const highlights = highlightsOf(release);
  const more = release.notes.length - highlights.length;

  const label = [
    `Version ${release.version}`,
    current ? "you're on this" : null,
    formatReleaseDate(release.date),
    release.headline,
    quiet ? "behind-the-scenes work" : countsText(release),
  ].filter(Boolean).join(", ");

  return (
    <PressableScale onPress={onPress} scaleTo={0.985} accessibilityRole="button" accessibilityLabel={label}>
      {top ? (
        <View style={styles.topEntry}>
          <Node dot={dotFor(release, true)} lineHeight={24} />
          <View style={styles.row}>
            <AppText size="md" weight="black" style={styles.topVersion}>{release.version}</AppText>
            {current && <Tag label="YOU'RE ON THIS" />}
            <View style={styles.grow} />
            <Icon name="chevronRight" size={18} color="inkDim" />
          </View>
          <View style={styles.topHead}>
            <AppText size="md" weight="bold" style={styles.topHeadline}>{release.headline}</AppText>
            <AppText size="xs" color="inkDim">
              {`${formatReleaseDate(release.date)} · build ${release.build}`}
            </AppText>
          </View>
          <Card padded={false} style={styles.topCard}>
            {quiet ? (
              <AppText size="sm" color="inkSecondary" style={styles.lh}>{QUIET_SENTENCE}</AppText>
            ) : (
              <>
                {highlights.map((note, i) => (
                  <View key={`${i}-${note.title}`} style={styles.mini}>
                    <Icon
                      name={note.icon ?? KIND_LOOK[note.kind].icon}
                      size={14}
                      containerSize={24}
                      containerRadius={8}
                      container="square"
                      gradient={KIND_LOOK[note.kind].tint}
                    />
                    <AppText size="sm" weight="semibold" style={[styles.grow, styles.lh]}>
                      {firstSentence(note.title)}
                    </AppText>
                  </View>
                ))}
                {more > 0 && (
                  <AppText size="xs" color="inkDim" style={highlights.length > 0 && styles.moreIndent}>
                    {highlights.length > 0 ? `and ${more} more` : countsText(release)}
                  </AppText>
                )}
              </>
            )}
          </Card>
        </View>
      ) : (
        <View style={styles.entry}>
          <Node dot={dotFor(release, false)} lineHeight={20} />
          <View style={styles.row}>
            <AppText size="sm" weight="black" style={styles.lh}>{release.version}</AppText>
            <View style={styles.grow} />
            <AppText size="xs" color="inkDim">{formatReleaseDate(release.date, false)}</AppText>
            <Icon name="chevronRight" size={16} color="inkDim" />
          </View>
          <AppText size="sm" weight="semibold" color="inkSecondary" style={styles.lh}>
            {release.headline}
          </AppText>
          {quiet ? (
            <AppText size="xs" color="inkDim">{QUIET_SENTENCE}</AppText>
          ) : (
            <View style={styles.counts}>
              {parts.map(({ kind, text }, i) => (
                <View key={kind} style={styles.count}>
                  {i > 0 && <AppText size="xs" color="inkDim">{" · "}</AppText>}
                  <View style={[styles.dot, { backgroundColor: colors[KIND_LOOK[kind].ink] }]} />
                  <AppText size="xs" color="inkDim">{text}</AppText>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  node: {
    position: "absolute",
  },
  currentNode: {
    borderRadius: radius.full,
    shadowColor: colors.accent,
    shadowOpacity: 0.9,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
  },
  currentHalo: {
    position: "absolute",
    top: -5,
    left: -5,
    right: -5,
    bottom: -5,
    borderRadius: radius.full,
    backgroundColor: colors.accentSoft,
  },
  majorNode: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.bg,
  },
  minorNode: {
    borderWidth: 2,
    borderColor: colors.gray300,
    backgroundColor: colors.bg,
  },
  patchNode: {
    backgroundColor: colors.gray300,
  },
  month: {
    marginTop: spacing.xs,
    marginBottom: -6,
    justifyContent: "center",
  },
  monthTick: {
    position: "absolute",
    top: "50%",
    left: RAIL_CENTRE - 5 - RAIL_GUTTER,
    width: 10,
    height: 1,
    backgroundColor: colors.glassBorder,
  },
  monthText: {
    fontSize: 11,
    letterSpacing: 1.4,
  },
  topEntry: {
    gap: 6,
  },
  entry: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  grow: {
    flex: 1,
    minWidth: 0,
  },
  topVersion: {
    lineHeight: 24,
  },
  topHead: {
    gap: 2,
    marginTop: -2,
  },
  topHeadline: {
    lineHeight: 24,
  },
  topCard: {
    gap: 10,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderRadius: radius.md,
  },
  mini: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  moreIndent: {
    paddingLeft: 34,
  },
  lh: {
    lineHeight: 20,
  },
  counts: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  count: {
    flexDirection: "row",
    alignItems: "center",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 5,
  },
});

export default TimelineEntry;
