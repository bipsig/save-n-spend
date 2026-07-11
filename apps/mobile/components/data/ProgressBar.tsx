import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radius } from "@/theme";
import type { ColorToken } from "@/theme";
import { barGradients, chipTintFor } from "@/theme/gradients";

type Props = {
  value: number,
  height?: number
  color?: ColorToken
  trackColor?: ColorToken
  /** Solid fill instead of the spec gradient (e.g. the white budget-hero bar). */
  solid?: boolean
}

// Spec .track — 7px pill at mock scale → 9pt on device; gradient fill in the row's hue.
const ProgressBar = ({
  value,
  height = 9,
  color = "primary",
  trackColor = "line",
  solid = false,
}: Props) => {

  const clamped = Math.max(0, Math.min(value, 100));
  // `surface` (white) has no gradient counterpart — render it solid.
  const useGradient = !solid && color !== "surface";

  return (
    <View style={[styles.track, { height, backgroundColor: colors[trackColor] }]}>
      {useGradient ? (
        <LinearGradient
          colors={[...barGradients[chipTintFor(color)]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fill, { width: `${clamped}%` }]}
        />
      ) : (
        <View
          style={[
            styles.fill,
            { width: `${clamped}%`, backgroundColor: colors[color] }
          ]}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    width: "100%",
    borderRadius: radius.full,
    overflow: "hidden"
  },
  fill: {
    height: "100%",
    borderRadius: radius.full
  }
})

export default ProgressBar;
