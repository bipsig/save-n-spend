import type { IBudget } from "@/lib/mock";
import { StyleSheet, View } from "react-native";
import Card from "../data/Card";
import { AppText } from "../ui/AppText";
import ProgressBar from "../data/ProgressBar";
import Icon from "../ui/Icon";
import { categoryById } from "@/lib/categories";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { spacing } from "@/theme";
import formatMoney from "@/lib/money";

type Props = {
  budget: IBudget
  spent: number
};

type StatusIcon = {
  icon: IconName
  color: ColorToken
};

// Spec budget row: gradient category chip · category-tinted bar · three-tier
// status (ok ✓ green / ≥80% clock amber / ≥100% alert red) driving icon + pace
// text · over rows get a red-tinted card border.
const BudgetCategoryRow = ({ budget, spent }: Props) => {
  const category = categoryById(budget.category);

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
          <AppText size="md" weight="bold">
            {category?.name ?? "Uncategorized"}
          </AppText>
          <AppText size="sm" color="inkDim">
            {`${formatMoney(spent)} of ${formatMoney(budget.limit)}`}
          </AppText>
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
