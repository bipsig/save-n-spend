import { StyleSheet, View } from "react-native"
import { AppText } from "../ui/AppText"
import Icon from "../ui/Icon"
import Button from "../ui/Button"
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
      <View style={styles.disc}>
        <Icon name={icon} size={30} color="accentLight" />
      </View>
      <AppText weight="black" size="md">
        {title}
      </AppText>
      {subtitle && (
        <AppText size="sm" color="inkDim" style={styles.text}>
          {subtitle}
        </AppText>
      )}
      {actionLabel && onAction && (
        <Button label={actionLabel} variant="primary" size="sm" pill onPress={onAction} />
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
  disc: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(139,123,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(163,148,255,0.3)",
  },
  text: {
    textAlign: "center",
    maxWidth: 220,
  }
})

export default EmptyState;
