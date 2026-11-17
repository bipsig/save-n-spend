import { StyleSheet, View, type AccessibilityRole } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "./Icon";
import PressableScale from "./PressableScale";
import type { IconName } from "@/lib/icons";
import { HEADER_ACTION_SIZE, hitSlopFor } from "@/lib/screenHeader";
import { colors, gradients, radius } from "@/theme";

type Props = {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityRole: AccessibilityRole;
  accessibilityHint?: string;
  /** `brand` is the gradient circle, kept for New. */
  tone?: "glass" | "brand";
  /** A mode that's on (reorder): filled circle, deep-ink glyph. */
  selected?: boolean;
  disabled?: boolean;
  size?: number;
  /** Off where the action fires its own haptic. */
  haptic?: boolean;
};

const IconButton = ({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityRole,
  accessibilityHint,
  tone = "glass",
  selected = false,
  disabled = false,
  size = HEADER_ACTION_SIZE,
  haptic = true,
}: Props) => {
  const brand = tone === "brand" && !selected;
  const circle = { width: size, height: size, borderRadius: radius.full };

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.9}
      haptic={haptic}
      hitSlop={hitSlopFor(size)}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, selected }}
      style={disabled && styles.disabled}
    >
      {/* The glow needs an unclipped layer of its own, as in Button. */}
      <View style={[circle, styles.center, brand ? styles.glow : selected ? styles.selected : styles.glass]}>
        {brand && (
          <LinearGradient
            colors={[...gradients.brand]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={[StyleSheet.absoluteFill, circle]}
          />
        )}
        <Icon
          name={icon}
          size={Math.round(size * (icon === "add" ? 0.55 : 0.48))}
          color={brand ? "surface" : selected ? "primaryInk" : "ink"}
        />
      </View>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  glass: { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder },
  selected: { backgroundColor: colors.primary },
  glow: {
    backgroundColor: gradients.brand[1],
    shadowColor: "#6D5CFF",
    shadowOpacity: 0.6,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  disabled: { opacity: 0.45 },
});

export default IconButton;
