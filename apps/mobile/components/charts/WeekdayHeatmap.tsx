import { StyleSheet, View } from "react-native";
import { AppText } from "../ui/AppText";
import { colors } from "@/theme";
import type { WeekdayHeatmapCell } from "@save-n-spend/types";

type Props = {
  cells: WeekdayHeatmapCell[];
};

// Seven static boxes, Monday-first, shaded by share of the heaviest weekday — the
// weekday-of-week analog of Insights' own day-of-month heatmap. Deliberately not
// interactive: this sits inside a carousel slide whose own single label already states
// the pattern in words (see the slide that wraps this), so seven single-letter buttons
// would only add noise for a screen reader, not information.
const WeekdayHeatmap = ({ cells }: Props) => (
  <View style={styles.row} importantForAccessibility="no-hide-descendants">
    {cells.map((cell) => (
      <View key={cell.day} style={styles.cell}>
        <View style={[styles.box, { opacity: Math.max(cell.intensity, cell.total > 0 ? 0.12 : 0.06) }]} />
        <AppText size="xs" weight="bold" color="inkDim">
          {cell.day[0]}
        </AppText>
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cell: {
    alignItems: "center",
    gap: 6,
  },
  box: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
});

export default WeekdayHeatmap;
