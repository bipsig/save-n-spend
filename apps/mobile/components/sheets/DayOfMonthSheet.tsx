import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import { haptics } from "@/lib/haptics";
import { colors, spacing } from "@/theme";

type Props = {
  value: number;
  /** Awaited, so a failed save keeps the sheet open with the reason. */
  onPick: (day: number) => Promise<void> | void;
};

// A 1–28 grid, capped at 28 so the chosen day exists in every month. Too many values for
// OptionSheet's row of chips (the TimeZoneSheet is the other "too big for chips" case), so
// this is a compact grid — picking is the decision, no separate save.
const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

const DayOfMonthSheet = forwardRef<BottomSheetModal, Props>(({ value, onPick }, ref) => {
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const dismiss = () => innerRef.current?.dismiss();

  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPending(null);
    setError(null);
  };

  const choose = async (day: number) => {
    if (pending !== null) return;
    setPending(day);
    setError(null);
    try {
      await onPick(day);
      dismiss();
    }
    catch (err) {
      haptics.error();
      setError(err instanceof Error ? err.message : "Couldn't save that. Try again.");
      setPending(null);
    }
  };

  return (
    <AppSheet ref={innerRef} onDismiss={reset}>
      <View style={styles.identity}>
        <Icon name="date" size={24} containerSize={52} container="square" gradient="accent" />
        <View style={styles.identityText}>
          <AppText size="md" weight="black">Reminder day</AppText>
          <AppText size="sm" color="inkDim">
            Which day each month we nudge you to update your investment values.
          </AppText>
        </View>
      </View>

      <View style={styles.grid}>
        {DAYS.map((day) => {
          const selected = day === value;
          return (
            <Pressable
              key={day}
              onPress={() => choose(day)}
              disabled={pending !== null && pending !== day}
              style={[styles.cell, selected && styles.cellSelected]}
            >
              <AppText size="sm" weight="bold" color={selected ? "ink" : "inkSecondary"}>{day}</AppText>
            </Pressable>
          );
        })}
      </View>

      {error && <AppText size="sm" color="danger" style={styles.error}>{error}</AppText>}
    </AppSheet>
  );
});

DayOfMonthSheet.displayName = "DayOfMonthSheet";

const styles = StyleSheet.create({
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  identityText: {
    flex: 1,
    gap: 3,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  cell: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  cellSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.primary,
  },
  error: {
    textAlign: "center",
  },
});

export default DayOfMonthSheet;
