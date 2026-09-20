import { StyleSheet } from "react-native";
import { router } from "expo-router";
import type { WeekdayHeatmapCell } from "@save-n-spend/types";
import Card from "./Card";
import { AppText } from "../ui/AppText";
import PressableScale from "../ui/PressableScale";
import WeekdayHeatmap from "../charts/WeekdayHeatmap";
import { FOR_YOU_SLIDE_HEIGHT } from "./ForYouCarousel";

type Props = {
  cells: WeekdayHeatmapCell[];
};

const WeekdayHeatmapSlide = ({ cells }: Props) => {
  const busiest = cells.reduce<WeekdayHeatmapCell | null>(
    (best, cell) => (cell.total > 0 && (!best || cell.total > best.total) ? cell : best),
    null,
  );
  const label = busiest
    ? `Spending by weekday: ${busiest.day} is your heaviest. Opens Insights.`
    : "Spending by weekday. Opens Insights.";

  return (
    <PressableScale
      onPress={() => router.push("/insights")}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Card style={styles.card}>
        <AppText size="xs" weight="semibold" color="inkDim" style={styles.label}>
          SPENDING BY WEEKDAY
        </AppText>
        <WeekdayHeatmap cells={cells} />
        {busiest && (
          <AppText size="xs" color="inkDim">
            {busiest.day} is your heaviest spend day.
          </AppText>
        )}
      </Card>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: 12,
    minHeight: FOR_YOU_SLIDE_HEIGHT,
  },
  label: {
    letterSpacing: 1,
  },
});

export default WeekdayHeatmapSlide;
