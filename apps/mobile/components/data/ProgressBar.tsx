import { StyleSheet, View } from "react-native";
import { colors, radius } from "@/theme";
import type { ColorToken } from "@/theme";

type Props = {
  value: number,
  height?: number
  color?: ColorToken
  trackColor?: ColorToken
}

const ProgressBar = ({
  value,
  height = 8,
  color = "primary",
  trackColor = "line"
}: Props) => {

  const clamped = Math.max(0, Math.min(value, 100));

  return (
    <View style={[styles.track, { height, backgroundColor: colors[trackColor] }]}>
      <View
        style={[
          styles.fill,
          { width: `${clamped}%`, backgroundColor: colors[color] }
        ]}
      />
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
