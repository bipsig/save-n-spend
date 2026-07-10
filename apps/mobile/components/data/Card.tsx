import { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import type { ViewProps } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radius, spacing } from "@/theme";

type Props = ViewProps & {
  children: ReactNode
  padded?: boolean
}

// Glass card — exact port of the approved mockup's CSS:
//   background: linear-gradient(158deg, rgba(255,255,255,.10), rgba(255,255,255,.035))
//   border: 1px solid rgba(255,255,255,.14); inset top highlight.
// Deliberately NO BlurView: every iOS blur "material" carries a built-in
// semi-opaque dark plate that reads as a solid tile. The mockup's glass is a
// translucent WHITE fill letting the ambient glow bleed through — over the
// already-soft glow, backdrop blur adds nothing visible.
const Card = ({ children, padded = true, style, ...rest }: Props) => {
  return (
    <View style={[styles.card, padded && styles.padded, style]} {...rest}>
      <LinearGradient
        colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0.035)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={StyleSheet.absoluteFill}
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
  topEdge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  padded: {
    padding: spacing.lg,
  },
})

export default Card;
