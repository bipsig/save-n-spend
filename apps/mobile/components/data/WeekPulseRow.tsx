import { StyleSheet } from "react-native";
import { router } from "expo-router";
import Card from "./Card";
import Caps from "../ui/Caps";
import PressableScale from "../ui/PressableScale";
import { StatRow } from "../ui/StatTile";
import formatMoney, { usePrivacyMask } from "@/lib/money";

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
        <Caps>This week</Caps>
        <StatRow
          surface="plain"
          items={[
            { label: "Spent", amount: expense, tone: "danger" },
            { label: "Earned", amount: income, tone: "success" },
            ...(savingsPace !== undefined ? [{ label: "Pace to save", amount: savingsPace }] : []),
          ]}
        />
      </Card>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: 10,
  },
});

export default WeekPulseRow;
