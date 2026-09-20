import { StyleSheet, View } from "react-native";
import { AppText } from "../ui/AppText";
import Icon from "../ui/Icon";
import PressableScale from "../ui/PressableScale";

type Props = {
  /** "August" (month) or "last week" (week) — already the right shape to drop into
   *  the sentence below. */
  label: string;
  onPress: () => void;
};

// Shown once per closed period (see store/settings's lastReviewedPeriod) — visually the
// same banner as NetWorthMilestoneBanner, a nudge rather than a popup, matching this
// app's own convention of never interrupting with a modal.
const ReviewReadyBanner = ({ label, onPress }: Props) => {
  const text = `Your ${label} review is ready`;

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${text}. Opens the review.`}
    >
      <View style={styles.banner}>
        <Icon name="summary" size={18} color="ink" />
        <AppText size="sm" weight="bold" color="inkSecondary" style={styles.text}>
          {text}
        </AppText>
        <Icon name="chevronRight" size={18} color="inkDim" />
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

export default ReviewReadyBanner;
