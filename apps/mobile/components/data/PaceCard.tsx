import { StyleSheet } from "react-native";
import { router } from "expo-router";
import type { DashboardPace } from "@save-n-spend/types";
import Card from "./Card";
import { AppText } from "../ui/AppText";
import PressableScale from "../ui/PressableScale";
import DualLineChart from "../charts/DualLineChart";
import { cumulativePair } from "@/lib/insights";
import formatMoney, { usePrivacyMask } from "@/lib/money";

type Props = {
  pace: DashboardPace;
};

// A visual answer to "am I ahead of or behind my own norm" — more informative than a
// single sentence, since it shows the whole shape of the month, not just where it
// stands right now. Reuses DualLineChart unmodified (already built for exactly this
// "current, shorter, vs previous, allowed to run longer" shape).
const PaceCard = ({ pace }: Props) => {
  usePrivacyMask(); // subscribe: the amounts below read formatMoney() directly

  const { current, previous, atCurrentEnd } = cumulativePair(pace.current, pace.average, "month");
  const ahead = atCurrentEnd.current <= atCurrentEnd.previous;
  const delta = Math.abs(atCurrentEnd.current - atCurrentEnd.previous);

  // Stated in words, not just drawn: the chart's own SVG path carries no accessibility
  // of its own, so this sentence is the only way a screen reader gets its conclusion.
  const label = `This month vs your average: pacing ${formatMoney(delta)} ${ahead ? "under" : "over"} your usual by this point. Opens Insights.`;

  return (
    <PressableScale
      onPress={() => router.push("/insights")}
      scaleTo={0.98}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Card style={styles.card}>
        <AppText size="xs" weight="semibold" color="inkDim" style={styles.label}>
          THIS MONTH VS YOUR AVERAGE
        </AppText>
        <DualLineChart current={current} previous={previous} currentLabel="This month" previousLabel="Your average" />
        <AppText size="xs" color="inkDim">
          You're pacing{" "}
          <AppText size="xs" weight="bold" color={ahead ? "success" : "warning"}>
            {formatMoney(delta)} {ahead ? "under" : "over"}
          </AppText>{" "}
          your usual by this point in the month.
        </AppText>
      </Card>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: 10,
  },
  label: {
    letterSpacing: 1,
  },
});

export default PaceCard;
