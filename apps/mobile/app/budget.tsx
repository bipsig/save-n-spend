import ProgressBar from "@/components/data/ProgressBar";
import BudgetCategoryRow from "@/components/rows/BudgetCategoryRow";
import GradientCard from "@/components/shell/GradientCard";
import ScreenScaffold from "@/components/shell/ScreenScaffold"
import { AppText } from "@/components/ui/AppText"
import { monthlyBudget, budgetSummary } from "@/lib/mock"
import formatMoney from "@/lib/money";
import { spacing } from "@/theme";
import { StyleSheet, View } from "react-native";

type BudgetStatProps = {
  label: string,
  stat: string
};

const BudgetStat = ({ label, stat }: BudgetStatProps) => {
  return (
    <View>
      <AppText size="xs" color="surface" style={styles.muted}>
        {label}
      </AppText>
      <AppText weight="bold" color="surface">
        {stat}
      </AppText>
    </View>
  )
}

const MonthlyBudgetCard = () => {
  const remaining = monthlyBudget.total - monthlyBudget.spent;
  const percentageUsed = Math.round((monthlyBudget.spent / monthlyBudget.total) * 1000) / 10;

  return (
    <GradientCard style={styles.card}>
      <View style={styles.topRow}>
        <View>
          <AppText size="sm" color="surface" style={styles.muted}>
            Monthly Budget
          </AppText>
          <AppText size="2xl" weight="black" color="surface">
            {formatMoney(monthlyBudget.total)}
          </AppText>
        </View>
        <View style={styles.spentCol}>
          <AppText size="xs" color="surface" style={styles.muted}>
            Spent
          </AppText>
          <AppText size="lg" weight="black" color="surface">
            {formatMoney(monthlyBudget.spent)}
          </AppText>
        </View>
      </View>

      <View style={styles.remainingRow}>
        <AppText color="surface" size="sm" style={styles.muted}>
          {`Remaining: ${formatMoney(remaining)}`}
        </AppText>
        <AppText color="surface" size="sm" style={styles.muted}>
          {`${percentageUsed}% used`}
        </AppText>
      </View>

      <ProgressBar value={percentageUsed} color="surface" trackColor="primaryInk" />

      <View style={styles.divider} />

      <View style={styles.statsRow}>
        <BudgetStat label="Budget Status" stat={monthlyBudget.status} />
        <BudgetStat label="Days Left" stat={`${monthlyBudget.daysLeft} days`} />
        <BudgetStat label="Daily Limit" stat={formatMoney(monthlyBudget.dailyLimit)} />
      </View>
    </GradientCard>
  )
}

const BudgetScreen = () => {
  return (
    <ScreenScaffold title="Budget">
      <MonthlyBudgetCard />

      {budgetSummary().map(({ budget, spent }) => (
        <BudgetCategoryRow key={budget._id} budget={budget} spent={spent} />
      ))}
    </ScreenScaffold>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  muted: {
    opacity: 0.85,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  spentCol: {
    alignItems: "flex-end",
  },
  remainingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
})

export default BudgetScreen;
