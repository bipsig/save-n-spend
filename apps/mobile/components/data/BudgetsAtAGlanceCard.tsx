import { StyleSheet, View } from "react-native";
import Card from "./Card";
import { AppText } from "../ui/AppText";
import Caps from "../ui/Caps";
import PressableScale from "../ui/PressableScale";
import { NameWithArchived } from "../ui/ArchivedMark";
import { useCategoryById } from "@/lib/categories";
import { budgetPace, budgetTotals, currentMonth, type BudgetSummary } from "@/lib/budgets";
import { formatPct } from "@/lib/format/pct";
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
      <View style={styles.name}>
        <NameWithArchived archived={!!category?.isArchived}>
          <AppText size="sm" weight="semibold" color="inkSecondary" numberOfLines={1} style={styles.shrink}>
            {category?.name ?? "Category"}
          </AppText>
        </NameWithArchived>
      </View>
      <AppText size="xs" weight="bold" color="inkDim">
        {formatPct(pace.ratio * 100)}
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
    ? `Budgets at a glance: all ${items.length} on track. Opens Budget.`
    : `Budgets at a glance: ${overCount} of ${items.length} over pace. Opens Budget.`;

  return (
    <PressableScale onPress={onPress} scaleTo={0.98} accessibilityRole="button" accessibilityLabel={label}>
      <Card style={styles.card}>
        <Caps>Budgets at a glance</Caps>
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
    minWidth: 0,
  },
  shrink: {
    flexShrink: 1,
  },
});

export default BudgetsAtAGlanceCard;
