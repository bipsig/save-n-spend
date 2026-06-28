import { StyleSheet } from "react-native";
import type { ViewProps } from "react-native";
import { gradients, radius, spacing } from "@/theme";
import type { GradientToken } from "@/theme";
import { LinearGradient } from "expo-linear-gradient";

type Props = ViewProps & {
  gradient?: GradientToken,
  children: React.ReactNode,
  padded?: boolean,
}

const GradientCard = ({
  gradient = "brand",
  children,
  padded = true,
  style,
  ...rest
}: Props) => {
  return (
    <LinearGradient
      colors={gradients[gradient]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, padded && styles.padded, style]}
      {...rest}
    >
      {children}
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: "hidden"
  },
  padded: {
    padding: spacing.lg
  }
})

export default GradientCard;
