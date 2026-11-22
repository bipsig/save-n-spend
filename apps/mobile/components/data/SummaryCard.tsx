import { IconName } from "@/lib/icons"
import { ColorToken, spacing } from "@/theme"
import Card from "@/components/data/Card"
import { StyleSheet, View } from "react-native"
import Icon from "../ui/Icon"
import { AppText } from "../ui/AppText"
import Money from "../ui/Money"
import PressableScale from "../ui/PressableScale"
import formatMoney, { usePrivacyMask } from "@/lib/money"

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
  /** For a net (Savings): see lib/signTone. Every other tile's figure stays `ink`. */
  amountColor?: ColorToken
  /** The tile's one plain line under the figure ("+24.7% vs Oct", "30.4% saved"). */
  caption?: string
  captionColor?: ColorToken
  /** All four Home tiles share one size, picked from the longest figure (lib/homeTiles). */
  size?: "lg" | "md"
  /**
   * Opens whatever breaks the figure down. Optional, and left off deliberately when there
   * is nothing behind it — a tile that squeezes under the finger without leading anywhere
   * promises a screen that doesn't exist.
   */
  onPress?: () => void
  /** The screen `onPress` opens, spoken by the accessibility label ("Opens Activity.") —
   *  a prop rather than inferred, since this card doesn't know its own destination. */
  destination?: string
}

const SummaryCard = ({
  icon,
  iconColor = "primary",
  iconBg = "accentSoft",
  label,
  amount,
  amountColor,
  caption,
  captionColor = "gray500",
  size = "lg",
  onPress,
  destination,
}: Props) => {
  usePrivacyMask(); // subscribe: the accessibility label below reads formatMoney() directly

  const accessibilityLabel = `${label}: ${formatMoney(amount)}${caption ? `, ${caption}` : ""}`
    + (onPress && destination ? `. Opens ${destination}.` : "");

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
          numberOfLines={1}
          style={styles.label}
        >
          {label}
        </AppText>
      </View>
      {/* One line, ellipsised rather than wrapped. A flex item is never squeezed below the
          width of its own content, so a long figure would push its tile wider than the one
          beside it — which is how two tiles in a row stopped being the same size. */}
      <Money value={amount} weight="black" size={size} color={amountColor} numberOfLines={1} />
      {/* Exactly one line high whether or not there is a caption, hence the fixed height
          and not a minimum: an empty Text has no line box, so a reserved minimum still came
          out shorter than a captioned tile beside it. */}
      <AppText
        weight="semibold"
        size="xs"
        color={captionColor}
        numberOfLines={1}
        style={styles.caption}
      >
        {caption ?? ""}
      </AppText>
    </Card>
  )

  // Always wrapped, tappable or not, so both kinds of tile are laid out by exactly the same
  // two boxes. The outer one takes the row sizing; the Card grows to whatever height the
  // row settles on, without a zero basis of its own — inside a column that would report no
  // content height at all, and a row of nothing but pressable tiles would collapse.
  if (!onPress) return <View style={styles.tile}>{card}</View>

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      style={styles.tile}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {card}
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  // Half the row: an even split from the zero basis, and `minWidth: 0` so a long figure
  // can't push its own tile wider than the one beside it.
  tile: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  card: {
    flexGrow: 1, // fills the tile, which the row has stretched to its tallest
    gap: 8, // spec .sum gap × device scale
    padding: 15,
  },
  label: {
    flex: 1, // shrinks and ellipsises instead of pushing the tile wider
  },
  // One line of xs (13pt), text or not.
  caption: {
    height: 17,
    lineHeight: 17,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9, // spec .sum .head gap × device scale
  }
})

export default SummaryCard;