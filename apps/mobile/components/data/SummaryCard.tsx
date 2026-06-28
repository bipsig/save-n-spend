import { IconName } from "@/lib/icons"
import { ColorToken, spacing } from "@/theme"
import Card from "@/components/data/Card"
import { StyleSheet, View } from "react-native"
import Icon from "../ui/Icon"
import { AppText } from "../ui/AppText"

type Props = {
  icon: IconName
  iconColor?: ColorToken
  iconBg?: ColorToken
  label: string
  amount: string
  caption?: string
  captionColor?: ColorToken
}

const SummaryCard = ({
  icon,
  iconColor = "primary",
  iconBg = "accentSoft",
  label,
  amount,
  caption,
  captionColor = "gray500"
}: Props) => {
  
  return (
    <Card style={styles.card}>
      <View style={styles.container}>
        <Icon
          name={icon}
          color={iconColor}
          container="square"
          containerColor={iconBg}
        />
        <AppText
          size="sm"
          color="gray500"
        >
          {label}
        </AppText>
      </View>
      <AppText weight="black" size="lg">
        {amount}
      </AppText>
      {caption && (
        <AppText weight="regular" size="xs" color={captionColor}>
          {caption}
        </AppText>
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: spacing.sm
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  }
})

export default SummaryCard;