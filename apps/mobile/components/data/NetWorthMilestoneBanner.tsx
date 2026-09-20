import { StyleSheet, View } from "react-native";
import { AppText } from "../ui/AppText";
import Icon from "../ui/Icon";
import PressableScale from "../ui/PressableScale";
import formatMoney, { usePrivacyMask } from "@/lib/money";

type Props = {
  milestone: number;
  onPress: () => void;
};

// Rare by construction (see lib/netWorthMilestone) — celebratory, never acted on beyond
// opening the same breakdown the Net Worth tile already does, so it stays meaningful
// precisely because it doesn't show up often.
const NetWorthMilestoneBanner = ({ milestone, onPress }: Props) => {
  usePrivacyMask(); // subscribe: the amount below reads formatMoney() directly

  const value = formatMoney(milestone);
  const label = `You just crossed ${value} in net worth. Opens your accounts.`;

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.banner}>
        <Icon name="trophy" size={18} color="ink" />
        <AppText size="sm" weight="bold" color="inkSecondary" style={styles.text}>
          You just crossed <AppText size="sm" weight="black" color="ink">{value}</AppText> in net worth
        </AppText>
      </View>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "rgba(155,140,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  text: {
    flex: 1,
  },
});

export default NetWorthMilestoneBanner;
