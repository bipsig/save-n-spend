import type { IBudget } from "@save-n-spend/types";
import { StyleSheet, View } from "react-native";
import Card from "../data/Card";
import { AppText } from "../ui/AppText";
import ProgressBar from "../data/ProgressBar";
import Icon from "../ui/Icon";
import PressableScale from "../ui/PressableScale";
import CategoryName from "../ui/CategoryName";
import { useCategoryById, useCategoryLabel } from "@/lib/categories";
import { budgetPace } from "@/lib/budgets";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { spacing } from "@/theme";
import formatMoney, { usePrivacyMask } from "@/lib/money";

type Props = {
  budget: IBudget
  spent: number
  /** From the screen's own `budgetTotals(...)` — this row doesn't recompute the
   *  month's calendar itself, so a closed month's pace is never read against
   *  today's date-of-month instead of the whole month it actually had. */
  daysElapsed: number
  daysInMonth: number
  onPress?: () => void
};

type StatusIcon = {
  icon: IconName
  color: ColorToken
};

// Spec budget row: gradient category chip · category-tinted bar (raw % of limit,
// unchanged) · status badge now driven by PACE rather than raw percent — on the 5th of
// the month every budget reads "on track" under the old percent-tier logic even for one
// that's already projecting way over; pace catches that on day 5, not day 25.
const BudgetCategoryRow = ({ budget, spent, daysElapsed, daysInMonth, onPress }: Props) => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below
  const category = useCategoryById(budget.category); // icon + colour for the chip
  const label = useCategoryLabel(budget.category); // name, parent, and child count

  const percentage = Math.min((spent / budget.limit) * 100, 100);
  const over = percentage >= 100;
  const barColor = over ? "danger" : ((category?.color ?? "accent") as ColorToken);

  const pace = budgetPace({ budget, spent }, daysElapsed, daysInMonth);
  const statusIcon: StatusIcon =
    pace.color === "danger"
      ? { icon: "budgetOver", color: "danger" }
      : pace.color === "warning"
      ? { icon: "budgetWarning", color: "warning" }
      : { icon: "budgetOk", color: "success" };

  // Pace, not the raw remaining: the forward-looking verdict this row didn't have
  // before. Projected off the same elapsed fraction budgetPace scores against.
  const elapsedFraction = Math.max(daysElapsed, 1) / daysInMonth;
  const projected = Math.round(spent / elapsedFraction);
  const overUnder = projected - budget.limit;
  const message = overUnder > 0
    ? `on pace, ${formatMoney(overUnder)} over`
    : `on pace, ${formatMoney(-overUnder)} to spare`;

  return (
    <PressableScale onPress={onPress} disabled={!onPress} scaleTo={0.98}>
      <Card style={[styles.card, over && styles.overCard]}>
        <View style={styles.header}>
          <Icon
            name={(category?.icon ?? "more") as IconName}
            size={22}
            containerSize={44}
            container="square"
            gradient={(category?.color ?? "accent") as ColorToken}
          />
          <View style={styles.info}>
            <CategoryName categoryId={budget.category} size="md" weight="bold" />
            <AppText size="sm" color="inkDim">
              {`${formatMoney(spent)} of ${formatMoney(budget.limit)}`}
            </AppText>
            {/* The one line that explains why this bar is higher than the transactions
                filed directly under this category would suggest. A limit on a parent
                governs everything beneath it — without saying so, the number looks
                wrong rather than inclusive. */}
            {label.childCount > 0 && (
              <AppText size="xs" color="inkDim">
                {`Includes ${label.childCount} sub-categor${label.childCount === 1 ? "y" : "ies"}`}
              </AppText>
            )}
          </View>
          <View style={styles.status}>
            <Icon name={statusIcon.icon} size={16} color={statusIcon.color} />
            <AppText size="xs" color={statusIcon.color} weight="semibold">
              {message}
            </AppText>
          </View>
        </View>

        <ProgressBar value={percentage} color={barColor} />
      </Card>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  overCard: {
    borderColor: "rgba(255,107,116,0.35)", // spec — red-tinted border when over
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  status: {
    alignItems: "flex-end",
    gap: 3,
  },
});

export default BudgetCategoryRow;
