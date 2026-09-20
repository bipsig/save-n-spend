import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Card from "./Card";
import { AppText } from "../ui/AppText";
import PressableScale from "../ui/PressableScale";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { colors } from "@/theme";

const Stat = ({ label, value, color }: { label: string; value: number; color?: string }) => (
  <View style={styles.stat}>
    {/* One line, ellipsised rather than wrapped — the minus sign on a negative figure is
        a valid line-break point on its own, and a narrow column will otherwise strand it
        alone on the line above the amount. */}
    <AppText size="md" weight="black" numberOfLines={1} style={color ? { color } : undefined}>
      {formatMoney(value)}
    </AppText>
    <AppText size="xs" weight="semibold" color="inkDim">
      {label}
    </AppText>
  </View>
);

type Props = {
  income: number;
  expense: number;
  /** Projected savings for the whole month, from the Safe-to-Spend forecast's own daily
   *  burn rate — added once that forecast exists; the row shows just two stats until then. */
  savingsPace?: number;
};

// A tighter feedback loop than the monthly grid above it — a month's figures barely move
// day to day, a week's do.
const WeekPulseRow = ({ income, expense, savingsPace }: Props) => {
  usePrivacyMask(); // subscribe: every stat below reads formatMoney() directly

  const label = `This week: ${formatMoney(expense)} spent, ${formatMoney(income)} earned`
    + (savingsPace !== undefined ? `, on pace to save ${formatMoney(savingsPace)} this month` : "")
    + ". Opens Insights.";

  return (
    <PressableScale
      onPress={() => router.push("/insights")}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Card style={styles.card}>
        <AppText size="xs" weight="semibold" color="inkDim" style={styles.label}>
          THIS WEEK
        </AppText>
        <View style={styles.row}>
          <Stat label="Spent" value={expense} color={colors.danger} />
          <View style={styles.divider} />
          <Stat label="Earned" value={income} color={colors.success} />
          {savingsPace !== undefined && (
            <>
              <View style={styles.divider} />
              <Stat label="On pace to save" value={savingsPace} />
            </>
          )}
        </View>
      </Card>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: 10,
  },
  label: {
    letterSpacing: 1,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  divider: {
    width: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
});

export default WeekPulseRow;
