import ProgressBar from "@/components/data/ProgressBar";
import BudgetCategoryRow from "@/components/rows/BudgetCategoryRow";
import GradientCard from "@/components/shell/GradientCard";
import ScreenScaffold from "@/components/shell/ScreenScaffold"
import { AppText } from "@/components/ui/AppText"
import { monthlyBudget, budgetSummary } from "@/lib/mock"
import formatMoney from "@/lib/money";
import { StyleSheet, View } from "react-native";

type BudgetStatProps = {
  label: string,
  stat: string,
  right?: boolean
};

const BudgetStat = ({ label, stat, right }: BudgetStatProps) => {
  return (
    <View style={right && styles.statRight}>
      <AppText size="xs" color="inkDim">
        {label}
      </AppText>
      <AppText size="sm" weight="bold">
        {stat}
      </AppText>
    </View>
  )
}

// Spec budget hero: violet-tinted glass · caps labels · 24/800 total ·
// white bar · hairline · status / days-left / daily-limit stats.
const MonthlyBudgetCard = () => {
  const remaining = monthlyBudget.total - monthlyBudget.spent;
  const percentageUsed = Math.round((monthlyBudget.spent / monthlyBudget.total) * 1000) / 10;

  return (
    <GradientCard style={styles.card}>
      <View style={styles.topRow}>
        <View>
          <AppText size="xs" weight="semibold" color="inkDim" style={styles.capsLabel}>
            MONTHLY BUDGET
          </AppText>
          <AppText size="xl" weight="black">
            {formatMoney(monthlyBudget.total)}
          </AppText>
        </View>
        <View style={styles.spentCol}>
          <AppText size="xs" weight="semibold" color="inkDim" style={styles.capsLabel}>
            SPENT
          </AppText>
          <AppText size="lg" weight="black">
            {formatMoney(monthlyBudget.spent)}
          </AppText>
        </View>
      </View>

      <View style={styles.remainingRow}>
        <AppText color="inkDim" size="xs">
          {`Remaining: ${formatMoney(remaining)}`}
        </AppText>
        <AppText color="inkDim" size="xs">
          {`${percentageUsed}% used`}
        </AppText>
      </View>

      <ProgressBar value={percentageUsed} color="surface" trackColor="primaryInk" />

      <View style={styles.divider} />

      <View style={styles.statsRow}>
        <BudgetStat label="Budget Status" stat={monthlyBudget.status} />
        <BudgetStat label="Days Left" stat={`${monthlyBudget.daysLeft} days`} />
        <BudgetStat label="Daily Limit" stat={formatMoney(monthlyBudget.dailyLimit)} right />
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
    gap: 12, // spec .hero gap × device scale
  },
  capsLabel: {
    letterSpacing: 1.2,
  },
  statRight: {
    alignItems: "flex-end",
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
