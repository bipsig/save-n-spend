import { StyleSheet, View } from "react-native";
import type { ViewProps } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients, radius, spacing } from "@/theme";
import type { GradientToken } from "@/theme";

type Props = ViewProps & {
  gradient?: GradientToken,
  children: React.ReactNode,
  padded?: boolean,
}

// Tinted glass hero — the SAME translucent white glass as Card, plus the brand
// gradient as a low-opacity wash so the card stays see-through (mockup look),
// just with a hint of identity color. Raise `wash` opacity for a stronger tint.
const GradientCard = ({
  gradient = "brand",
  children,
  padded = true,
  style,
  ...rest
}: Props) => {
  return (
    <View style={[styles.card, padded && styles.padded, style]} {...rest}>
      <LinearGradient
        colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0.035)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <LinearGradient
        colors={gradients[gradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, styles.wash]}
        pointerEvents="none"
      />
      <View style={styles.topEdge} pointerEvents="none" />
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  wash: {
    opacity: 0.15,
  },
  topEdge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  padded: {
    padding: spacing.lg,
  },
})

export default GradientCard;
