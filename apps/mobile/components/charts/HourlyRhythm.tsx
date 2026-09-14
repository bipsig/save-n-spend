import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import PressableScale from "@/components/ui/PressableScale";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { hourAbbr } from "@/lib/insights";
import type { HourCell, HourlyPattern } from "@/lib/insights";

type Props = {
  rhythm: HourlyPattern;
  /** The selected hour (0–23), or null. Owned by the screen so a tap elsewhere clears it. */
  active: number | null;
  onSelect: (hour: number | null) => void;
};

// The same four-step violet ramp as SpendHeatmap, verbatim — a cell here and a day there
// should read as the same kind of thing.
const BANDS = [
  "rgba(255,255,255,0.05)",  // nothing spent
  "rgba(155,140,255,0.28)",
  "rgba(155,140,255,0.55)",
  "rgba(155,140,255,0.82)",
  "#9B8CFF",
] as const;

const bandFor = (cell: HourCell): string => {
  if (cell.amount === 0) return BANDS[0];
  if (cell.intensity <= 0.25) return BANDS[1];
  if (cell.intensity <= 0.5) return BANDS[2];
  if (cell.intensity <= 0.75) return BANDS[3];
  return BANDS[4];
};

// Labelling every cell the way SpendHeatmap labels every day-of-week column would be
// illegible at 24-across phone width, so only these four reference points get a tick.
const TICKS = new Set([0, 6, 12, 18]);

/**
 * Today as a strip, each hour tinted by what it cost — the Day period's analog of
 * SpendHeatmap. A strip rather than a grid: an hour-of-day has no week to align to the way
 * a day-of-month does, so there is no calendar padding here, just however many hours have
 * actually happened.
 */
const HourlyRhythm = ({ rhythm, active, onSelect }: Props) => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below
  const { cells, busiest, clearHours } = rhythm;

  const selected = active !== null ? cells.find((c) => c.hour === active) ?? null : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {cells.map((cell) => (
          <PressableScale
            key={cell.hour}
            onPress={() => onSelect(active === cell.hour ? null : cell.hour)}
            scaleTo={0.85}
            style={[
              styles.cell,
              { backgroundColor: bandFor(cell) },
              active === cell.hour && styles.cellActive,
            ]}
            accessibilityLabel={`${hourAbbr(cell.hour)}: ${formatMoney(cell.amount)}`}
          >
            {null}
          </PressableScale>
        ))}
      </View>

      {/* Built from the same array as the strip above, not a fixed 24, so a tick always
          sits under the hour it names even mid-day when fewer cells have happened yet. */}
      <View style={styles.row}>
        {cells.map((cell) => (
          <View key={cell.hour} style={styles.axisSlot}>
            {TICKS.has(cell.hour) && (
              <AppText size="xs" color="inkDim" numberOfLines={1}>
                {hourAbbr(cell.hour)}
              </AppText>
            )}
          </View>
        ))}
      </View>

      {selected ? (
        <AppText size="xs" color="inkDim">
          {selected.amount === 0
            ? `Nothing spent at ${hourAbbr(selected.hour)}`
            : `${formatMoney(selected.amount)} at ${hourAbbr(selected.hour)}`}
        </AppText>
      ) : (
        <AppText size="xs" color="inkDim">
          {busiest
            ? `Heaviest hour ${formatMoney(busiest.amount)} at ${hourAbbr(busiest.hour)} · ${clearHours} clear hour${clearHours === 1 ? "" : "s"}`
            : "Nothing spent yet today"}
        </AppText>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  row: {
    flexDirection: "row",
    gap: 2,
  },
  cell: {
    flex: 1,
    height: 40,
    borderRadius: 4,
  },
  cellActive: {
    borderWidth: 1.5,
    borderColor: "#F5F4FC",
  },
  axisSlot: {
    flex: 1,
    alignItems: "center",
  },
});

export default HourlyRhythm;
