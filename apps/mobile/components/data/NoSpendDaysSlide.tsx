import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Card from "./Card";
import { AppText } from "../ui/AppText";
import PressableScale from "../ui/PressableScale";
import { FOR_YOU_SLIDE_HEIGHT } from "./ForYouCarousel";
import formatMoney, { usePrivacyMask } from "@/lib/money";

type Props = {
  noSpendDays: number;
  daysElapsed: number;
  /** From the same `useInsights('month', 0)` fetch that feeds the Spending Snapshot —
   *  the "vs last month" half of this slide is free, no new endpoint for it. */
  avgDailySpendCurrent?: number;
  avgDailySpendPrevious?: number;
};

// Rewards restraint, not just logging — the streak badge already covers "did you track
// something today"; this is "did you NOT spend today", a different behaviour entirely.
const NoSpendDaysSlide = ({ noSpendDays, daysElapsed, avgDailySpendCurrent, avgDailySpendPrevious }: Props) => {
  usePrivacyMask(); // subscribe: the comparison line below reads formatMoney() directly

  const comparison = avgDailySpendCurrent !== undefined && avgDailySpendPrevious !== undefined && avgDailySpendPrevious > 0
    ? `Avg ${formatMoney(avgDailySpendCurrent)}/day this month, ${avgDailySpendCurrent <= avgDailySpendPrevious ? "down" : "up"} from ${formatMoney(avgDailySpendPrevious)}/day last month.`
    : null;

  const label = `No-spend days: ${noSpendDays} of ${daysElapsed} so far this month.`
    + (comparison ? ` ${comparison}` : "") + " Opens Insights.";

  return (
    <PressableScale
      onPress={() => router.push("/insights")}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Card style={styles.card}>
        <AppText size="xs" weight="semibold" color="inkDim" style={styles.label}>
          NO-SPEND DAYS
        </AppText>
        <View style={styles.row}>
          <AppText size="2xl" weight="black">
            {noSpendDays}
            <AppText size="md" weight="bold" color="inkDim">/{daysElapsed}</AppText>
          </AppText>
          {comparison && (
            <AppText size="xs" color="inkDim" style={styles.detail}>
              {comparison}
            </AppText>
          )}
        </View>
      </Card>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: 10,
    minHeight: FOR_YOU_SLIDE_HEIGHT,
  },
  label: {
    letterSpacing: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  detail: {
    flex: 1,
    lineHeight: 16,
  },
});

export default NoSpendDaysSlide;
