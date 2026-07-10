import type { IBudget } from "@/lib/mock";
import { StyleSheet, View } from "react-native";
import Card from "../data/Card";
import { AppText } from "../ui/AppText";
import ProgressBar from "../data/ProgressBar";
import Icon from "../ui/Icon";
import { categoryBg, categoryById } from "@/lib/categories";
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

const BudgetCategoryRow = ({ budget, spent }: Props) => {
  const category = categoryById(budget.category);

  const percentage = Math.min((spent / budget.limit) * 100, 100);
  const statusIcon: StatusIcon =
    percentage >= 100
      ? { icon: "budgetOver", color: "danger" }
      : percentage >= 80
      ? { icon: "budgetWarning", color: "warning" }
      : { icon: "budgetOk", color: "success" };

  const message = `${formatMoney(Math.abs(spent - budget.limit))} ${spent > budget.limit ? "over" : "left"}`;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Icon
          name={(category?.icon ?? "more") as IconName}
          size={24}
          container="square"
          color={(category?.color ?? "gray500") as ColorToken}
          containerColor={categoryBg(category?.color)}
        />
        <View style={styles.info}>
          <AppText size="md" weight="bold">
            {category?.name ?? "Uncategorized"}
          </AppText>
          <AppText size="sm" color="gray500">
            {`${formatMoney(spent)} of ${formatMoney(budget.limit)}`}
          </AppText>
        </View>
        <View style={styles.status}>
          <Icon name={statusIcon.icon} size={18} color={statusIcon.color} />
          <AppText size="sm" color={statusIcon.color} weight="bold">
            {message}
          </AppText>
        </View>
      </View>

      <ProgressBar value={percentage} color={statusIcon.color} />
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  info: {
    flex: 1,
    gap: spacing.xs,
  },
  status: {
    alignItems: "flex-end",
    gap: spacing.xs,
  },
});

export default BudgetCategoryRow;
