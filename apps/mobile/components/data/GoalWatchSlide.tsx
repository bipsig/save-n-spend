import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { GoalWatchSlice } from "@save-n-spend/types";
import Card from "./Card";
import ProgressBar from "./ProgressBar";
import { AppText } from "../ui/AppText";
import Icon from "../ui/Icon";
import PressableScale from "../ui/PressableScale";
import { FOR_YOU_SLIDE_HEIGHT } from "./ForYouCarousel";
import formatMoney, { usePrivacyMask } from "@/lib/money";

type Props = {
  slice: GoalWatchSlice;
};

// The single active goal closest to its own pace-based finish — framed as a projection
// ("done in ~4 months"), not a warning, unlike the health score's goalsPillar this
// mirrors: that pillar only scores goals with a deadline and flags falling behind one,
// this one is just "how's it going" for whichever goal is closest, deadline or not.
const GoalWatchSlide = ({ slice }: Props) => {
  usePrivacyMask(); // subscribe: the amounts below read formatMoney() directly

  const percent = Math.round((slice.saved / slice.target) * 100);
  const monthLabel = new Date(slice.projectedDate).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const label = `Goal watch: ${slice.goalName}, ${formatMoney(slice.saved)} of ${formatMoney(slice.target)} saved. `
    + `At this pace, done around ${monthLabel}. Opens Goals.`;

  return (
    <PressableScale
      onPress={() => router.push("/goals")}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Card style={styles.card}>
        <View style={styles.topRow}>
          <Icon name="trophy" size={20} containerSize={40} containerRadius={13} container="square" gradient="violet" />
          <View style={styles.col}>
            <AppText size="sm" weight="bold" numberOfLines={1}>
              {slice.goalName}
            </AppText>
            <AppText size="xs" color="inkDim">
              {formatMoney(slice.saved)} of {formatMoney(slice.target)} saved
            </AppText>
          </View>
        </View>
        <ProgressBar value={percent} color="primary" />
        <AppText size="xs" color="inkDim">
          At this pace, done around <AppText size="xs" weight="bold" color="ink">{monthLabel}</AppText>.
        </AppText>
      </Card>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: 10,
    minHeight: FOR_YOU_SLIDE_HEIGHT,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  col: {
    flex: 1,
    gap: 2,
  },
});

export default GoalWatchSlide;
