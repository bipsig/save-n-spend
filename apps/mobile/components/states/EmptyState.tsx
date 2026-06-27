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

const EmptyState = ({ icon = "search", title, subtitle, actionLabel, onAction }: Props) => {
  return (
    <View style={styles.container}>
      <Icon name={icon} size={32} color="gray400" container="circle" containerColor="surface2" />
      <AppText weight="bold" size="lg">
        {title}
      </AppText>
      {subtitle && (
        <AppText size="sm" color="gray500" style={styles.text}>
          {subtitle}
        </AppText>
      )}
      {actionLabel && onAction && (
        <Button label={actionLabel} variant="primary" size="sm" onPress={onAction} />
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
    textAlign: "center"
  }
})

export default EmptyState;
