import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import PressableScale from "./PressableScale";
import { haptics } from "@/lib/haptics";
import type { ColorToken } from "@/theme";
import { spacing } from "@/theme";
import { chipGradients, chipTintFor } from "@/theme/gradients";

// The palette offered in colour pickers — the semantic tints, rendered as their
// vivid chip gradients.
export const PICKER_COLORS: ColorToken[] = [
  "accent", "info", "success", "warning", "danger",
  "teal", "pink", "lime", "orange", "indigo",
];

type Props = {
  value: ColorToken;
  onChange: (color: ColorToken) => void;
  colors?: ColorToken[];
};

// Spec .swrow — gradient swatches; the selected one gets a white ring. Shared by
// the new-category and new-goal flows.
const ColorPicker = ({ value, onChange, colors = PICKER_COLORS }: Props) => (
  <View style={styles.row}>
    {colors.map((token) => {
      const selected = value === token;
      return (
        // `select`, like every other picker: a swatch row is a set you move through.
        <PressableScale
          key={token}
          onPress={() => {
            haptics.select();
            onChange(token);
          }}
          scaleTo={0.9}
          haptic={false}
          hitSlop={4}
          style={[styles.ring, selected && styles.ringOn]}
        >
          <LinearGradient
            colors={[...chipGradients[chipTintFor(token)]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={styles.swatch}
          />
        </PressableScale>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  ring: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  ringOn: {
    borderColor: "#FFFFFF",
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
});

export default ColorPicker;
