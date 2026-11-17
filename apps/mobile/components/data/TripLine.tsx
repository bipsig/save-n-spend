import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { router } from "expo-router";
import { AppText } from "../ui/AppText";
import Icon from "../ui/Icon";
import PressableScale from "../ui/PressableScale";
import formatMoney, { usePrivacyMask } from "@/lib/money";

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
  const text = `Plus ${formatMoney(amount)} on trips${note ? ` · ${note}` : ""}`;

  return (
    <PressableScale
      onPress={() => router.push("/trips")}
      scaleTo={0.98}
      style={[styles.row, style]}
      accessibilityRole="button"
      accessibilityLabel={`${text.replace(" · ", ", ")}. See trips`}
    >
      <View style={styles.icon}>
        <Icon name="flight" size={14} color="inkDim" />
      </View>
      <AppText color="inkDim" size="xs" style={styles.text}>
        {text}
      </AppText>
      {seeTrips && <AppText size="xs" weight="black" color="primary">See trips</AppText>}
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
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
