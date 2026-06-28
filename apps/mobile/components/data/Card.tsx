import { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import type { ViewProps } from "react-native";
import { colors, radius, shadows, spacing } from "@/theme";

type Props = ViewProps & {
  children: ReactNode
  padded?: boolean
}

const Card = ({ children, padded = true, style, ...rest }: Props) => {
  return (
    <View style={[styles.card, padded && styles.padded, style]} {...rest}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadows.sm
  },
  padded: {
    padding: spacing.lg
  }
})

export default Card;
