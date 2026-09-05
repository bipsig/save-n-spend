import { Pressable, StyleSheet } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { haptics } from "@/lib/haptics";
import { MASKED_MONEY, formatMoneyExact, usePrivacyMask } from "@/lib/money";
import { useSettings } from "@/store/settings";
import type { ColorToken, FontSizeToken, FontWeightToken } from "@/theme";

type Props = {
  /** Integer paise, like everything else in the app. */
  value: number;
  /**
   * Sign or symbol printed in front — usually "+ " or "− " from a row that has
   * already decided the direction. Kept even while masked: a direction says
   * nothing about a magnitude, and losing it would make a masked list unreadable.
   */
  prefix?: string;
  weight?: FontWeightToken;
  size?: FontSizeToken;
  color?: ColorToken;
  numberOfLines?: number;
};

// An amount that can be looked at.
//
// With privacy mode off this is exactly `<AppText>{formatMoney(v)}</AppText>` and
// nothing more. With it on, the masked figure becomes its own tap target that
// reveals EVERY amount in the app for ten seconds — not just this one. Revealing a
// single figure would mean tapping your way across a screen to add two numbers up,
// which is the opposite of a privacy feature people leave switched on.
//
// Pressable only WHILE masked, which is what keeps it from stealing the row it
// sits in: a transaction row's amount reveals on the first tap, and once revealed
// taps pass straight through to the row and open the detail sheet as usual. The
// amount stops being a control the moment it has nothing left to tell you.
const Money = ({ value, prefix = "", weight, size, color, numberOfLines }: Props) => {
  const masked = usePrivacyMask();
  const peek = useSettings((s) => s.peek);

  // Deliberately not `formatMoney`: this component subscribes to the mask itself,
  // so it decides, and reading the store twice could disagree mid-render.
  const label = masked ? `${prefix}${MASKED_MONEY}` : `${prefix}${formatMoneyExact(value)}`;

  const text = (
    <AppText weight={weight} size={size} color={color} numberOfLines={numberOfLines}>
      {label}
    </AppText>
  );

  // No fade between the two states, deliberately: the string's width changes when
  // a figure replaces the dots, and sixty amounts cross-fading at different widths
  // at once reads as the screen glitching rather than as one thing being revealed.
  // The peek bar is what animates, because it is the thing that is actually new.
  if (!masked) return text;

  return (
    <Pressable
      onPress={() => {
        // `toggle`, not `tap`: this is a state change with a duration, the same
        // weight as flipping the switch that turned masking on.
        haptics.toggle();
        peek();
      }}
      hitSlop={8}
      style={styles.press}
      accessibilityRole="button"
      accessibilityLabel="Amount hidden. Tap to show amounts for ten seconds."
    >
      {text}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  // The dots are narrower than most figures, so without this a masked amount in a
  // right-aligned row would sit a few pixels off from where the real one does.
  press: {
    alignItems: "flex-end",
  },
});

export default Money;
