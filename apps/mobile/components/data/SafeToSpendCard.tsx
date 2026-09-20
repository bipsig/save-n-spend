import { StyleSheet, View } from "react-native";
import Card from "./Card";
import { AppText } from "../ui/AppText";
import Icon from "../ui/Icon";
import PressableScale from "../ui/PressableScale";
import Button from "../ui/Button";
import Money from "../ui/Money";
import formatMoney from "@/lib/money";

type Props = {
  /** No budget set for this month — a different card entirely, not a ₹0. */
  hasBudgets: boolean;
  /** Remaining budget minus what's still owed on unpaid bills through this month. */
  safeToSpend: number;
  dailySafeToSpend: number;
  daysLeft: number;
  onPress?: () => void;
  onSetBudget: () => void;
};

// Same family as HealthScoreCard — plain glass card, the color lives in the icon chip
// and the figure itself, not a wash across the whole thing. Leads the dashboard, above
// HealthScoreCard: a daily "what can I spend" number is checked far more often than a
// slower, reflective score.
const SafeToSpendCard = ({ hasBudgets, safeToSpend, dailySafeToSpend, daysLeft, onPress, onSetBudget }: Props) => {
  // No budget set. Shown rather than hidden or faked as ₹0 — same precedent
  // HealthScoreCard's own empty state follows: honest about what it's waiting for.
  if (!hasBudgets) {
    return (
      <Card style={styles.card}>
        <View style={styles.topContainer}>
          <Icon name="wallet" size={22} containerSize={47} container="square" gradient="violet" />
          <View style={styles.titleCol}>
            <AppText size="xs" weight="semibold" color="inkDim" style={styles.label}>
              SAFE TO SPEND
            </AppText>
            <AppText size="md" weight="black" color="inkSecondary">No budget set</AppText>
          </View>
        </View>
        <AppText size="xs" color="inkDim">
          Set a budget and this fills in with what's actually left to spend.
        </AppText>
        <Button label="Set a budget" size="sm" variant="secondary" onPress={onSetBudget} />
      </Card>
    );
  }

  // Not clamped at zero — a negative figure is the honest signal this card exists to
  // give, the same way budgetTotals's own "Over Budget" status is never floored either.
  const over = safeToSpend < 0;
  // The card answers "today", so the daily rate leads — the month's total is context
  // underneath, not the other way around. Showing a ₹1,429 hero above a "₹142.90/day"
  // caption reads as two different answers to the same question; only one of them can
  // be the headline. A closed month has no "per day" left to lead with, so it falls
  // back to the total on its own.
  const heroValue = daysLeft > 0 ? dailySafeToSpend : safeToSpend;

  return (
    <PressableScale onPress={onPress} disabled={!onPress} scaleTo={0.98}>
      <Card style={styles.card}>
        <View style={styles.topContainer}>
          <Icon
            name="wallet"
            size={22}
            containerSize={47}
            container="square"
            gradient={over ? "red" : "green"}
          />
          <View style={styles.titleCol}>
            <AppText size="xs" weight="semibold" color="inkDim" style={styles.label}>
              SAFE TO SPEND
            </AppText>
            <AppText size="lg" weight="black">{over ? "Over budget" : "On track"}</AppText>
          </View>
          <View style={styles.score}>
            <Money
              value={Math.abs(heroValue)}
              prefix={over ? "− " : ""}
              size="xl"
              weight="black"
              color={over ? "danger" : "ink"}
            />
            {daysLeft > 0 && (
              <AppText size="xs" weight="semibold" color="inkDim">/day</AppText>
            )}
          </View>
        </View>

        <AppText size="xs" color="inkDim">
          {daysLeft > 0
            ? `${formatMoney(Math.abs(safeToSpend))} ${over ? "over" : "left"} this month · ${daysLeft} day${daysLeft === 1 ? "" : "s"} to go`
            : "The month is over — this is what's left."}
        </AppText>
      </Card>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: 12, // spec .hero gap × device scale, matching HealthScoreCard
  },
  topContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  titleCol: {
    flex: 1,
    gap: 3,
  },
  label: {
    letterSpacing: 1,
  },
  score: {
    alignItems: "flex-end",
  },
});

export default SafeToSpendCard;
