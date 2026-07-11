import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { iconMap, IconName } from "@/lib/icons"
import { colors, ColorToken, radius } from "@/theme"
import { chipGradients, chipInk, chipGlow, chipTintFor } from "@/theme/gradients"
import type { ChipTint } from "@/theme/gradients"
import { StyleSheet, View } from "react-native"

type Props = {
  name: IconName
  size?: number
  color?: ColorToken
  container?: "none" | "circle" | "square"
  containerColor?: ColorToken
  glow?: boolean // soft shadow in the container's color (dark-glass accent chips)
  /**
   * Spec `.chip .g-*` treatment: vivid gradient chip + deep-ink glyph + glow.
   * Pass a tint name, or a semantic color token (success/info/…) to map it.
   * Overrides `containerColor`/`color`; requires container !== "none".
   */
  gradient?: ChipTint | ColorToken
  /** Explicit chip square size (spec: 36). Defaults to icon size + padding. */
  containerSize?: number
  /** Override the square's corner radius (spec: schip 8 · chip 12 · row ic 9). */
  containerRadius?: number
}

const Icon = ({
  name,
  size = 24,
  color = "ink",
  container = "none",
  containerColor = "accentSoft",
  glow = false,
  gradient,
  containerSize,
  containerRadius,
}: Props) => {
  if (container === "none") {
    return <MaterialIcons name={iconMap[name]} size={size} color={colors[color]} />
  }

  const borderRadius = container === "circle" ? radius.full : containerRadius ?? radius.sm
  const box = containerSize ?? Math.round(size * 1.8)

  if (gradient) {
    const tint: ChipTint = gradient in chipGradients ? (gradient as ChipTint) : chipTintFor(gradient)
    return (
      <View
        style={[
          styles.container,
          {
            width: box,
            height: box,
            borderRadius,
            shadowColor: chipGlow[tint],
            shadowOpacity: 0.45,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 5 },
            elevation: 8,
          },
        ]}
      >
        <LinearGradient
          colors={[...chipGradients[tint]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
        />
        <MaterialIcons name={iconMap[name]} size={size} color={chipInk[tint]} />
      </View>
    )
  }

  return (
    <View
      style={[
        styles.container,
        {
          width: box,
          height: box,
          backgroundColor: colors[containerColor],
          borderRadius,
        },
        glow && {
          shadowColor: colors[containerColor],
          shadowOpacity: 0.55,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 8,
        },
      ]}
    >
      <MaterialIcons name={iconMap[name]} size={size} color={colors[color]} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start"
  }
})

export default Icon;
