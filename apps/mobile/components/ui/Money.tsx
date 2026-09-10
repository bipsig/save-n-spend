import { Pressable, StyleSheet } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { haptics } from "@/lib/haptics";
import { MASKED_MONEY, formatMoneyExact, usePrivacyMask } from "@/lib/money";
import { useSettings } from "@/store/settings";
import type { ColorToken, FontSizeToken, FontWeightToken } from "@/theme";

type Props = {
  /** Integer paise, like everything else in the app. */
  value: number;
  /** Sign or symbol printed in front, usually "+ " or "− ". Kept even while masked: a
   * direction says nothing about a magnitude, and losing it makes a masked list
   * unreadable. */
  prefix?: string;
  weight?: FontWeightToken;
  size?: FontSizeToken;
  color?: ColorToken;
  numberOfLines?: number;
  /** Which edge the figure is pinned to. Only matters while masked, since the dots are
   * narrower than most figures. Tiles and heroes read left, hence the default. */
  align?: "left" | "right";
};

// An amount that can be looked at. With privacy mode off this is just
// `<AppText>{formatMoney(v)}</AppText>`. With it on, the masked figure is a tap target that
// reveals EVERY amount for ten seconds — revealing one at a time would mean tapping across
// a screen to add two numbers up.
//
// Pressable only WHILE masked, so it doesn't steal the row it sits in: once revealed, taps
// pass through to the row and open the detail sheet as usual.
const Money = ({ value, prefix = "", weight, size, color, numberOfLines, align = "left" }: Props) => {
  const masked = usePrivacyMask();
  const peek = useSettings((s) => s.peek);

  // Not `formatMoney`: this component subscribes to the mask itself, and reading the store
  // twice could disagree mid-render.
  const label = masked ? `${prefix}${MASKED_MONEY}` : `${prefix}${formatMoneyExact(value)}`;

  const text = (
    <AppText weight={weight} size={size} color={color} numberOfLines={numberOfLines}>
      {label}
    </AppText>
  );

  // No fade between the two states: the width changes when a figure replaces the dots, and
  // sixty amounts cross-fading at once reads as the screen glitching. The peek bar animates
  // instead, being the thing that is actually new.
  if (!masked) return text;

  return (
    <Pressable
      onPress={() => {
        // `toggle`, not `tap` — a state change with a duration, the same weight as the
        // switch that turned masking on.
        haptics.toggle();
        peek();
      }}
      hitSlop={8}
      style={align === "right" ? styles.pressRight : undefined}
      accessibilityRole="button"
      accessibilityLabel="Amount hidden. Tap to show amounts for ten seconds."
    >
      {text}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  // The dots are narrower than most figures, so a masked amount in a right-aligned row
  // would otherwise sit a few pixels off from the real one.
  pressRight: {
    alignItems: "flex-end",
  },
});

export default Money;
