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
  
  // Spec .sum tile: 26px soft chip + 10.5 dim cap · 17/800 amount · 10 delta.
  return (
    <Card style={styles.card}>
      <View style={styles.container}>
        <Icon
          name={icon}
          size={17}
          containerSize={32}
          containerRadius={10}
          color={iconColor}
          container="square"
          containerColor={iconBg}
        />
        <AppText
          size="xs"
          weight="semibold"
          color="inkDim"
        >
          {label}
        </AppText>
      </View>
      <AppText weight="black" size="lg">
        {amount}
      </AppText>
      {caption && (
        <AppText weight="semibold" size="xs" color={captionColor}>
          {caption}
        </AppText>
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: 8, // spec .sum gap × device scale
    padding: 15,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9, // spec .sum .head gap × device scale
  }
})

export default SummaryCard;