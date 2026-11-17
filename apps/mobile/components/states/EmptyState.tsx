import { StyleSheet, View } from "react-native"
import { AppText } from "../ui/AppText"
import Button from "../ui/Button"
import StateDisc from "./StateDisc"
import type { IconName } from "@/lib/icons"
import { spacing } from "@/theme"

type Props = {
  icon?: IconName
  title: string
  subtitle?: string
  actionLabel?: string
  onAction?: () => void
}

// Spec .emptyblock — soft violet icon disc, one headline, one human sentence,
// one CTA.
const EmptyState = ({ icon = "search", title, subtitle, actionLabel, onAction }: Props) => {
  return (
    <View style={styles.container}>
      <StateDisc icon={icon} />
      <AppText weight="black" size="md">
        {title}
      </AppText>
      {subtitle && (
        <AppText size="sm" color="inkDim" style={styles.text}>
          {subtitle}
        </AppText>
      )}
      {actionLabel && onAction && (
        <View style={styles.action}>
          <Button label={actionLabel} variant="primary" size="sm" pill onPress={onAction} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing["3xl"]
  },
  text: {
    textAlign: "center",
    maxWidth: 220,
  },
  action: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.xs,
  }
})

export default EmptyState;
