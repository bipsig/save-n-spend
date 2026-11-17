import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import { router } from "expo-router";
import { AppText } from "../ui/AppText";
import Icon from "../ui/Icon";
import PressableScale from "../ui/PressableScale";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { stacksAction } from "@/lib/screenStates";
import { spacing } from "@/theme";

type Props = {
  /** Paise, already known to be above zero (see `tripLine` in lib/everydaySpend). */
  amount: number;
  /** After the amount: "counted in saved". */
  note?: string;
  /** Show "See trips" at the end. Without it the line still opens Trips. */
  seeTrips?: boolean;
  style?: StyleProp<ViewStyle>;
};

// "Plus ₹X on trips" under an everyday spending total (D21 A+), the line Activity's summary
// already has. Tapping it opens Trips.
const TripLine = ({ amount, note, seeTrips = false, style }: Props) => {
  usePrivacyMask(); // subscribe: the line reads formatMoney() directly
  const stacked = seeTrips && stacksAction(useWindowDimensions().fontScale);
  const text = `Plus ${formatMoney(amount)} on trips${note ? ` · ${note}` : ""}`;
  const press = {
    onPress: () => router.push("/trips"),
    scaleTo: 0.98,
    accessibilityRole: "button" as const,
    accessibilityLabel: `${text.replace(" · ", ", ")}. See trips`,
  };
  const icon = (
    <View style={styles.icon}>
      <Icon name="flight" size={14} color="inkDim" />
    </View>
  );
  const line = (
    <AppText color="inkDim" size="xs" style={styles.text}>
      {text}
    </AppText>
  );
  const action = <AppText size="xs" weight="black" color="primary">See trips</AppText>;

  // At the accessibility text sizes "See trips" goes under the text, so the amount keeps its width (W-4).
  if (stacked) {
    return (
      <PressableScale {...press} style={[styles.stacked, style]}>
        <View style={[styles.row, styles.stretch]}>
          {icon}
          {line}
        </View>
        {action}
      </PressableScale>
    );
  }

  return (
    <PressableScale {...press} style={[styles.row, style]}>
      {icon}
      {line}
      {seeTrips && action}
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
  },
  stacked: {
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  stretch: {
    alignSelf: "stretch",
  },
  // Level with the first line of text when the text wraps (Home's half-width tile).
  icon: {
    paddingTop: 1,
  },
  text: {
    flex: 1,
    lineHeight: 17,
  },
});

export default TripLine;
