import type { IBudget } from "@save-n-spend/types";
import { StyleSheet, View } from "react-native";
import Card from "../data/Card";
import { AppText } from "../ui/AppText";
import ProgressBar from "../data/ProgressBar";
import Icon from "../ui/Icon";
import PressableScale from "../ui/PressableScale";
import CategoryName from "../ui/CategoryName";
import { useCategoryById, useCategoryLabel } from "@/lib/categories";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { spacing } from "@/theme";
import formatMoney, { usePrivacyMask } from "@/lib/money";

type Props = {
  budget: IBudget
  spent: number
  onPress?: () => void
};

type StatusIcon = {
  icon: IconName
  color: ColorToken
};

// Spec budget row: gradient category chip · category-tinted bar · three-tier
// status (ok ✓ green / ≥80% clock amber / ≥100% alert red) driving icon + pace
// text · over rows get a red-tinted card border.
const BudgetCategoryRow = ({ budget, spent, onPress }: Props) => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below
  const category = useCategoryById(budget.category); // icon + colour for the chip
  const label = useCategoryLabel(budget.category); // name, parent, and child count

  const percentage = Math.min((spent / budget.limit) * 100, 100);
  const over = percentage >= 100;
  const statusIcon: StatusIcon =
    over
      ? { icon: "budgetOver", color: "danger" }
      : percentage >= 80
      ? { icon: "budgetWarning", color: "warning" }
      : { icon: "budgetOk", color: "success" };

  const message = `${formatMoney(Math.abs(spent - budget.limit))} ${spent > budget.limit ? "over" : "left"}`;
  const barColor = over ? "danger" : ((category?.color ?? "accent") as ColorToken);

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
