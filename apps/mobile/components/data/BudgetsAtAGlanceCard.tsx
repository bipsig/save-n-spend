import { StyleSheet, View } from "react-native";
import Card from "./Card";
import { AppText } from "../ui/AppText";
import PressableScale from "../ui/PressableScale";
import { useCategoryById } from "@/lib/categories";
import { budgetPace, budgetTotals, currentMonth, type BudgetSummary } from "@/lib/budgets";
import { colors } from "@/theme";

const DOT_COLOR: Record<"success" | "warning" | "danger", string> = {
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
};

const Row = ({ item, daysElapsed, daysInMonth }: { item: BudgetSummary; daysElapsed: number; daysInMonth: number }) => {
  const category = useCategoryById(item.budget.category);
  const pace = budgetPace(item, daysElapsed, daysInMonth);

  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: DOT_COLOR[pace.color] }]} />
      <AppText size="sm" weight="semibold" color="inkSecondary" numberOfLines={1} style={styles.name}>
        {category?.name ?? "Category"}
      </AppText>
      <AppText size="xs" weight="bold" color="inkDim">
        {Math.round(pace.ratio * 100)}%
      </AppText>
    </View>
  );
};

type Props = {
  items: BudgetSummary[];
  onPress: () => void;
};

// A traffic-light glance at every budget's pace, not just the one furthest over — the
// systemic check Budgets otherwise needs its own visit for. Zero new data: `items` is
// already fetched on the dashboard for Safe to Spend.
const BudgetsAtAGlanceCard = ({ items, onPress }: Props) => {
  // Safe-to-Spend's own empty state already owns "set a budget" — a second one here
  // would be exactly the repetitive-card complaint this redesign exists to fix.
  if (items.length === 0) return null;

  const { daysElapsed, daysInMonth } = budgetTotals(items, currentMonth());
  const overCount = items.filter((item) => budgetPace(item, daysElapsed, daysInMonth).ratio > 1).length;
  const label = overCount === 0
    ? `Budgets at a glance: all ${items.length} on track. Opens Budgets.`
    : `Budgets at a glance: ${overCount} of ${items.length} over pace. Opens Budgets.`;

  return (
    <PressableScale onPress={onPress} scaleTo={0.98} accessibilityRole="button" accessibilityLabel={label}>
      <Card style={styles.card}>
        <AppText size="xs" weight="semibold" color="inkDim" style={styles.label}>
          BUDGETS AT A GLANCE
        </AppText>
        {items.map((item) => (
          <Row key={item.budget._id} item={item} daysElapsed={daysElapsed} daysInMonth={daysInMonth} />
        ))}
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
    alignItems: "center",
    gap: 10,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  name: {
    flex: 1,
  },
});

export default BudgetsAtAGlanceCard;
