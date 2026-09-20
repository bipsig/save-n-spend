import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Card from "./Card";
import { AppText } from "../ui/AppText";
import Icon from "../ui/Icon";
import PressableScale from "../ui/PressableScale";

type Props = {
  runwayMonths: number | null;
};

// The health score's own "buffer" pillar, restated as its own card — the raw number was
// already computed there (see healthService's bufferPillar), just never exposed on its
// own before. Reads straight off the already-fetched health score: zero new network call.
const EmergencyFundCard = ({ runwayMonths }: Props) => {
  // No expense history to measure runway against — omit rather than show a made-up
  // number, the same rule HealthScoreCard's own empty state follows.
  if (runwayMonths === null) return null;

  const value = runwayMonths >= 6 ? "6+ months" : `${runwayMonths.toFixed(1)} months`;
  const label = `Emergency buffer: ${value} of average expenses covered by cash on hand. Opens Health.`;

  return (
    <PressableScale
      onPress={() => router.push("/health")}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Card style={styles.card}>
        <View style={styles.row}>
          <Icon name="shield" size={20} containerSize={40} containerRadius={13} container="square" gradient="blue" />
          <View style={styles.col}>
            <AppText size="xs" weight="semibold" color="inkDim" style={styles.label}>
              EMERGENCY BUFFER
            </AppText>
            <AppText size="sm" weight="bold">
              {value} <AppText size="xs" weight="semibold" color="inkDim">of expenses covered</AppText>
            </AppText>
          </View>
        </View>
      </Card>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  col: {
    flex: 1,
    gap: 2,
  },
  label: {
    letterSpacing: 1,
  },
});

export default EmergencyFundCard;
