import { StyleSheet, View } from "react-native";
import { AppText } from "../ui/AppText";
import { appZone } from "@/lib/zone";
import { colors } from "@/theme";
import type { ColorToken } from "@/theme";
import type { ReviewMoment } from "@save-n-spend/types";

const DOT_COLOR: Record<ReviewMoment["kind"], ColorToken> = {
  win: "success",
  warn: "warning",
  neutral: "primary",
};

const dateLabel = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-IN", { month: "short", day: "numeric", timeZone: appZone() });

// A vertical dot-and-line read of the period, chronological rather than grouped by topic
// — the counterpart to the thematic sections below it on the review screen. Short is
// normal: `moments` only ever carries what actually happened (see reviewTimelineService),
// so a quiet period has fewer dots, never padded ones.
const ReviewTimeline = ({ moments }: { moments: ReviewMoment[] }) => (
  <View style={styles.timeline}>
    {moments.map((moment, i) => (
      <View key={`${moment.date}-${i}`} style={[styles.row, i === moments.length - 1 && styles.lastRow]}>
        <View style={styles.line} pointerEvents="none" />
        <View style={[styles.dot, { backgroundColor: colors[DOT_COLOR[moment.kind]] }]} />
        <View style={styles.content}>
          <AppText size="xs" weight="bold" color="inkDim" style={styles.date}>
            {dateLabel(moment.date)}
          </AppText>
          <AppText size="sm" weight="semibold" color="inkSecondary" style={styles.text}>
            {moment.text}
          </AppText>
        </View>
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  timeline: {
    paddingLeft: 22,
  },
  row: {
    position: "relative",
    paddingBottom: 18,
  },
  lastRow: {
    paddingBottom: 0,
  },
  line: {
    position: "absolute",
    left: -17,
    top: 4,
    bottom: -4,
    width: 2,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  dot: {
    position: "absolute",
    left: -22,
    top: 3,
    width: 11,
    height: 11,
    borderRadius: 6,
  },
  content: {
    gap: 2,
  },
  date: {
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  text: {
    lineHeight: 19,
  },
});

export default ReviewTimeline;
