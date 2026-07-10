import { MaterialIcons } from "@expo/vector-icons";
import { iconMap, IconName } from "@/lib/icons"
import { colors, ColorToken, radius } from "@/theme"
import { StyleSheet, View } from "react-native"

type Props = {
  name: IconName
  size?: number
  color?: ColorToken
  container?: "none" | "circle" | "square"
  containerColor?: ColorToken
  glow?: boolean // soft shadow in the container's color (dark-glass accent chips)
}

const Icon = ({
  name,
  size = 24,
  color = "ink",
  container = "none",
  containerColor = "accentSoft",
  glow = false
}: Props) => {
  const glyph = <MaterialIcons name={iconMap[name]} size={size} color={colors[color]} />

  if (container === "none") {
    return glyph;
  } 

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors[containerColor],
          borderRadius: container === "circle" ? radius.full : radius.sm,
          padding: size*0.4
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
      {glyph}
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