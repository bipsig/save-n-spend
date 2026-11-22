import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { AppText } from "@/components/ui/AppText";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { formatCalendar } from "@/lib/format/date";
import { haptics } from "@/lib/haptics";
import { inRange, monthGrid, monthOfDay, monthTitle, movesBetween, shiftMonth, type CloseRange } from "@/lib/tripClose";
import { colors, spacing } from "@/theme";
import { errorText } from "@/lib/apiError";
import { useFormError } from "@/lib/useFormError";
import FormError from "@/components/ui/FormError";

type Props = {
  tripName: string;
  /** Your share, paise: the one expense the trip counts as. */
  amount: number;
  range: CloseRange;
  /** Days with trip expenses, marked with a dot. */
  expenseDays: string[];
  /** The day the picker opens on. */
  initial: string;
  /** "change": a closed trip's day, from the trip page. */
  mode: "close" | "change";
  /** Awaited, so a failed save keeps the sheet open with the reason. */
  onConfirm: (day: string) => Promise<void>;
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

// Picking the day a trip counts on: a month calendar limited to the trip's start..today, dots on
// the days with trip expenses, and a line naming the amount and the month it lands in.
const CloseDateSheet = forwardRef<BottomSheetModal, Props>(({ tripName, amount, range, expenseDays, initial, mode, onConfirm }, ref) => {
  usePrivacyMask();
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const [day, setDay] = useState(initial);
  const [month, setMonth] = useState(monthOfDay(initial));
  const [busy, setBusy] = useState(false);
  const { error, fail, clear: clearError } = useFormError();
  const spent = new Set(expenseDays);

  const reset = () => {
    setDay(initial);
    setMonth(monthOfDay(initial));
    clearError();
  };

  const confirm = async () => {
    setBusy(true);
    clearError();
    try {
      await onConfirm(day);
      innerRef.current?.dismiss();
    }
    catch (err) {
      fail(errorText(err, "Couldn't save that. Try again."));
    }
    finally {
      setBusy(false);
    }
  };

  const moved = mode === "change" ? movesBetween(initial, day) : null;
  const canBack = monthOfDay(range.first) < month;
  const canForward = month < monthOfDay(range.today);
  const helper = moved
    ? `Moves ${formatMoney(amount)} from ${moved.from} to ${moved.to}.`
    : `${tripName} counts as one ${formatMoney(amount)} expense in Trips on this day, so it lands in ${monthTitle(monthOfDay(day))}.`;

  return (
    <AppSheet
      ref={innerRef}
      onDismiss={reset}
      footer={<Button label={mode === "close" ? "Close trip" : "Save date"} loading={busy} onPress={confirm} />}
    >
      <AppText size="md" weight="black">{mode === "close" ? `Close ${tripName}` : "Change close date"}</AppText>
      <View style={styles.field}>
        <Icon name="date" size={18} color="inkDim" />
        <View style={styles.grow}>
          <AppText size="xs" color="inkDim">Close date</AppText>
          <AppText size="sm" weight="bold">{formatCalendar(day, "weekday")}</AppText>
        </View>
      </View>

      <View style={styles.nav}>
        <Pressable onPress={() => setMonth(shiftMonth(month, -1))} disabled={!canBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous month" accessibilityState={{ disabled: !canBack }} style={!canBack && styles.off}>
          <Icon name="chevronLeft" size={18} color="inkDim" />
        </Pressable>
        <AppText size="sm" weight="bold">{monthTitle(month)}</AppText>
        <Pressable onPress={() => setMonth(shiftMonth(month, 1))} disabled={!canForward} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next month" accessibilityState={{ disabled: !canForward }} style={!canForward && styles.off}>
          <Icon name="chevronRight" size={18} color="inkDim" />
        </Pressable>
      </View>

      <View style={styles.grid}>
        <View style={styles.week}>
          {WEEKDAYS.map((w, i) => <AppText key={i} size="xs" weight="bold" color="inkDim" style={styles.head}>{w}</AppText>)}
        </View>
        {monthGrid(month).map((week, w) => (
          <View key={w} style={styles.week}>
            {week.map((cell, i) => {
              if (!cell) return <View key={i} style={styles.cell} />;
              const allowed = inRange(cell, range);
              const selected = cell === day;
              return (
                <Pressable
                  key={cell}
                  onPress={() => setDay(cell)}
                  disabled={!allowed}
                  style={[styles.cell, spent.has(cell) && styles.spent, selected && styles.selected]}
                  accessibilityRole="radio"
                  accessibilityLabel={`${formatCalendar(cell, "weekday")}${spent.has(cell) ? ", has trip expenses" : ""}`}
                  accessibilityState={{ selected, disabled: !allowed }}
                >
                  <AppText size="sm" weight="semibold" color={selected ? "ink" : allowed ? "inkSecondary" : "inkDim"} style={!allowed && styles.off}>
                    {Number(cell.slice(8))}
                  </AppText>
                  {spent.has(cell) && <View style={[styles.dot, selected && styles.dotOn]} />}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <AppText size="xs" color="inkDim" style={styles.lh}>
        {helper} Pick any day from the trip's start ({formatCalendar(range.first)}) to today. Dots mark days with trip expenses.
      </AppText>
      <FormError message={error} />
    </AppSheet>
  );
});

CloseDateSheet.displayName = "CloseDateSheet";

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  lh: { lineHeight: 17 },
  field: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: colors.glassBorder },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  off: { opacity: 0.35 },
  grid: { gap: 4 },
  week: { flexDirection: "row", gap: 4 },
  head: { flex: 1, textAlign: "center" },
  cell: { flex: 1, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  spent: { backgroundColor: "rgba(45,212,191,0.10)" },
  selected: { backgroundColor: colors.primary },
  dot: { position: "absolute", bottom: 5, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.teal },
  dotOn: { backgroundColor: colors.ink },
});

export default CloseDateSheet;
