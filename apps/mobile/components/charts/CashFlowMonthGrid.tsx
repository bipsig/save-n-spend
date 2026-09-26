import { Pressable, StyleSheet, View } from "react-native";
import type { CashFlowDay, CashFlowItemKind } from "@save-n-spend/types";
import { AppText } from "@/components/ui/AppText";
import { haptics } from "@/lib/haptics";
import { colors } from "@/theme";

type Props = {
  /** `YYYY-MM` of the month shown. */
  month: string;
  /** The projection, keyed by `YYYY-MM-DD`. Days outside it (past, beyond the horizon) have
   *  no entry and render dimmed and untappable. */
  days: Map<string, CashFlowDay>;
  todayKey: string;
  selected: string | null;
  onSelect: (date: string) => void;
};

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** One colour per kind, used for the dots here and the legend and rows on the screen. */
export const KIND_COLOR: Record<CashFlowItemKind, string> = {
  bill: colors.warning,
  sip: colors.teal,
  income: colors.success,
};

const pad = (n: number) => String(n).padStart(2, "0");

// A plain month calendar. Each day shows up to three dots for what's scheduled; a day whose
// projected balance goes below zero is tinted red, so a shortfall stands out before anything
// is tapped.
const CashFlowMonthGrid = ({ month, days, todayKey, selected, onSelect }: Props) => {
  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  // Monday-first: getUTCDay is 0 for Sunday.
  const lead = (new Date(Date.UTC(year, mon - 1, 1)).getUTCDay() + 6) % 7;

  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);

  return (
    <View>
      <View style={styles.row}>
        {WEEKDAYS.map((w, i) => (
          <View key={i} style={styles.cell}>
            <AppText size="xs" weight="bold" color="inkDim">{w}</AppText>
          </View>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((d, i) => {
          if (d === null) return <View key={i} style={styles.cell} />;
          const key = `${month}-${pad(d)}`;
          const day = days.get(key);
          const isToday = key === todayKey;
          const isSelected = key === selected;
          const short = !!day && day.balance < 0;
          const kinds = day ? [...new Set(day.items.map((it) => it.kind))] : [];
          const label = day
            ? `${d}${isToday ? ", today" : ""}${day.items.length ? `, ${day.items.length} scheduled` : ""}${short ? ", balance below zero" : ""}`
            : `${d}`;
          return (
            <Pressable
              key={i}
              style={styles.cell}
              disabled={!day}
              onPress={() => {
                haptics.tap();
                onSelect(key);
              }}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: isSelected, disabled: !day }}
            >
              <View style={[
                styles.day,
                short && styles.dayShort,
                isToday && styles.dayToday,
                isSelected && styles.daySelected,
              ]}>
                <AppText
                  size="sm"
                  weight={isToday || isSelected ? "black" : "semibold"}
                  color={!day ? "inkDim" : short ? "danger" : "ink"}
                  style={!day && styles.dayOff}
                >
                  {d}
                </AppText>
                <View style={styles.dots}>
                  {kinds.map((k) => <View key={k} style={[styles.dot, { backgroundColor: KIND_COLOR[k] }]} />)}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    width: `${100 / 7}%`,
    alignItems: "center",
    paddingVertical: 3,
  },
  day: {
    width: 40,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  dayShort: {
    backgroundColor: colors.dangerSoft,
  },
  dayToday: {
    borderWidth: 1,
    borderColor: "rgba(155,140,255,0.6)",
  },
  daySelected: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  dayOff: {
    opacity: 0.45,
  },
  dots: {
    flexDirection: "row",
    gap: 3,
    height: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});

export default CashFlowMonthGrid;
