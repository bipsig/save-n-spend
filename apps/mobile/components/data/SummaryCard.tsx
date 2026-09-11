import { IconName } from "@/lib/icons"
import { ColorToken, spacing } from "@/theme"
import Card from "@/components/data/Card"
import { StyleSheet, View } from "react-native"
import Icon from "../ui/Icon"
import { AppText } from "../ui/AppText"
import Money from "../ui/Money"
import PressableScale from "../ui/PressableScale"

type Props = {
  icon: IconName
  iconColor?: ColorToken
  iconBg?: ColorToken
  label: string
  /**
   * Integer paise, not a preformatted string. The card renders it through `Money`, which
   * makes a masked figure its own tap-to-peek target — the gesture Settings promises
   * ("tap any one to peek for 10s"). A caller that formats first would hand over a string
   * with no way back to the number, and the tile would be the one masked amount on the
   * dashboard that could not be looked at.
   */
  amount: number
  caption?: string
  captionColor?: ColorToken
  /**
   * Opens whatever breaks the figure down. Optional: most tiles are a reading with
   * nothing behind them, and a tile that squeezes under the finger without leading
   * anywhere promises a screen that doesn't exist.
   */
  onPress?: () => void
}

const SummaryCard = ({
  icon,
  iconColor = "primary",
  iconBg = "accentSoft",
  label,
  amount,
  caption,
  captionColor = "gray500",
  onPress
}: Props) => {

  // Spec .sum tile: 26px soft chip + 10.5 dim cap · 17/800 amount · 10 delta.
  const card = (
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
      <Money value={amount} weight="black" size="lg" />
      {caption && (
        <AppText weight="semibold" size="xs" color={captionColor}>
          {caption}
        </AppText>
      )}
    </Card>
  )

  if (!onPress) return card

  // `flex: 1` has to land on the touchable too, or the tile stops filling its half of
  // the row — the Card's own flex would be measuring inside a box already sized to it.
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} style={styles.press}>
      {card}
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: 8, // spec .sum gap × device scale
    padding: 15,
  },
  press: {
    flex: 1,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9, // spec .sum .head gap × device scale
  }
})

export default SummaryCard;