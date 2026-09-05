import { useEffect, useRef } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Icon from "./Icon";
import PressableScale from "./PressableScale";
import { haptics } from "@/lib/haptics";
import { PICKER_ICONS } from "@/lib/icons";
import type { IconName } from "@/lib/icons";
import { spacing } from "@/theme";

type Props = {
  value: IconName;
  onChange: (icon: IconName) => void;
  icons?: IconName[];
};

// How many rows the grid is tall; the rest scrolls horizontally. Keeps a large
// icon set compact instead of a huge vertical block, and the horizontal gesture
// doesn't fight the sheet's vertical scroll.
const ROWS = 3;
const COLUMN_WIDTH = 52 + spacing.sm; // cell + gap

// Spec .ipick — glyph cells, the selected one in a violet ring + glow. A 3-row
// horizontally-paged grid so 70+ icons stay tidy. Shared by the new-category and
// new-goal flows (and wherever an entity needs an icon).
const IconPicker = ({ value, onChange, icons = PICKER_ICONS }: Props) => {
  const scrollRef = useRef<ScrollView>(null);

  const columns: IconName[][] = [];
  for (let i = 0; i < icons.length; i += ROWS) {
    columns.push(icons.slice(i, i + ROWS));
  }

  // Bring the pre-selected icon into view on mount so it doesn't sit off-screen.
  useEffect(() => {
    const index = icons.indexOf(value);
    if (index < 0) return;
    const x = Math.max(0, Math.floor(index / ROWS) * COLUMN_WIDTH - COLUMN_WIDTH);
    scrollRef.current?.scrollTo({ x, animated: false });
    // Mount-only: never yank the grid while the user is tapping around.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.grid}
      keyboardShouldPersistTaps="handled"
    >
      {columns.map((column, index) => (
        <View key={index} style={styles.column}>
          {column.map((name) => {
            const selected = value === name;
            return (
              // Browsing an icon grid means a lot of taps in a row, so `select` — the
              // tick for moving through a set — rather than the heavier press.
              <PressableScale
                key={name}
                onPress={() => {
                  haptics.select();
                  onChange(name);
                }}
                scaleTo={0.9}
                haptic={false}
                hitSlop={4}
                style={[styles.cell, selected && styles.cellOn]}
              >
                <Icon name={name} size={22} color={selected ? "surface" : "inkDim"} />
              </PressableScale>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  column: {
    gap: spacing.sm,
  },
  cell: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  cellOn: {
    backgroundColor: "rgba(139,123,255,0.2)",
    borderWidth: 1.5,
    borderColor: "#A394FF",
    shadowColor: "#8B7BFF",
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
});

export default IconPicker;
