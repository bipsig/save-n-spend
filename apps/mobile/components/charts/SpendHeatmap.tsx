import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import PressableScale from "@/components/ui/PressableScale";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import type { HeatCell, Heatmap } from "@/lib/insights";

type Props = {
  heatmap: Heatmap;
  /** The selected day, or null. Owned by the screen so a tap elsewhere clears it. */
  active: string | null;
  onSelect: (date: string | null) => void;
};

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

// Violet, at four steps. Discrete rather than a continuous ramp: nobody reads a 12% difference
// in opacity, and four bands are four things a legend can name.
const BANDS = [
  "rgba(255,255,255,0.05)",  // nothing spent
  "rgba(155,140,255,0.28)",
  "rgba(155,140,255,0.55)",
  "rgba(155,140,255,0.82)",
  "#9B8CFF",
] as const;

const bandFor = (cell: HeatCell): string => {
  if (cell.amount === 0) return BANDS[0];
  if (cell.intensity <= 0.25) return BANDS[1];
  if (cell.intensity <= 0.5) return BANDS[2];
  if (cell.intensity <= 0.75) return BANDS[3];
  return BANDS[4];
};

/**
 * The window as a calendar, each day tinted by what it cost.
 *
 * What the trend line cannot show: which DAYS of the week the money goes, and how long the
 * clear runs are. A line drawn over 31 points reads as a shape; a grid reads as a habit.
 *
 * Tinted by share of the heaviest day, not of the total — on an absolute scale a month's spend
 * spread across 30 days leaves every cell colourless. So the darkest cell is always the
 * costliest day, and the legend says as much.
 */
const SpendHeatmap = ({ heatmap, active, onSelect }: Props) => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below
  const { weeks, busiest, clearDays } = heatmap;

  const selected = active
    ? weeks.flat().find((c) => c?.date === active) ?? null
    : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {WEEKDAYS.map((d, i) => (
          <AppText key={i} size="xs" color="inkDim" style={styles.head}>
            {d}
          </AppText>
        ))}
      </View>

      {weeks.map((week, w) => (
        <View key={w} style={styles.row}>
          {week.map((cell, d) =>
            cell === null ? (
              // A spacer, not a zero-spend day: the window simply doesn't include it.
              <View key={d} style={styles.cellSlot} />
            ) : (
              <View key={d} style={styles.cellSlot}>
                <PressableScale
                  onPress={() => onSelect(active === cell.date ? null : cell.date)}
                  scaleTo={0.9}
                  style={[
                    styles.cell,
                    { backgroundColor: bandFor(cell) },
                    active === cell.date && styles.cellActive,
                  ]}
                  accessibilityLabel={`${cell.dayOfMonth}: ${formatMoney(cell.amount)}`}
                >
                  <AppText
                    size="xs"
                    weight={cell.intensity > 0.5 ? "bold" : "regular"}
                    // Deep ink on the darkest bands: the ring's own violet is bright enough
                    // that light text on it stops being readable.
                    color={cell.intensity > 0.5 ? "primaryInk" : "inkDim"}
                  >
                    {cell.dayOfMonth}
                  </AppText>
                </PressableScale>
              </View>
            ),
          )}
        </View>
      ))}

      {selected ? (
        <AppText size="xs" color="inkDim">
          {selected.amount === 0
            ? `Nothing spent on the ${selected.dayOfMonth}${ordinal(selected.dayOfMonth)}`
            : `${formatMoney(selected.amount)} on the ${selected.dayOfMonth}${ordinal(selected.dayOfMonth)}`}
        </AppText>
      ) : (
        <AppText size="xs" color="inkDim">
          {busiest
            ? `Heaviest day ${formatMoney(busiest.amount)} · ${clearDays} clear day${clearDays === 1 ? "" : "s"}`
            : "Nothing spent in this window"}
        </AppText>
      )}
    </View>
  );
};

const ordinal = (n: number): string => {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
};

const styles = StyleSheet.create({
  wrap: {
    gap: 5,
  },
  row: {
    flexDirection: "row",
    gap: 5,
  },
  head: {
    flex: 1,
    textAlign: "center",
  },
  // The slot holds the column width; the cell inside it is square and can shrink on press
  // without the grid reflowing.
  cellSlot: {
    flex: 1,
    aspectRatio: 1,
  },
  cell: {
    flex: 1,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  cellActive: {
    borderWidth: 1.5,
    borderColor: "#F5F4FC",
  },
});

export default SpendHeatmap;
