import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppHeader from "@/components/shell/AppHeader";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import SummaryCard from "@/components/data/SummaryCard";
import HealthScoreCard from "@/components/data/HealthScoreCard";
import SectionHeader from "@/components/ui/SectionHeader";
import BillRow from "@/components/rows/BillRow";
import GoalCard from "@/components/rows/GoalCard";
import TransactionRow from "@/components/rows/TransactionRow";
import formatMoney from "@/lib/money";
import { dashboard } from "@/lib/mock";
import { gradients, radius, spacing } from "@/theme";
import Icon from "@/components/ui/Icon";
import { useFocusEffect, useRouter } from "expo-router";
import { useDashboardSummary } from "@/lib/dashboard";
import { useBills, groupBills } from "@/lib/bills";
import { useGoals, sortGoals } from "@/lib/goals";
import { useTransactions } from "@/lib/transactions";
import { useSession } from "@/store/session";
import ErrorState from "@/components/states/ErrorState";
import SkeletonState from "@/components/states/SkeletonState";
import { useCallback } from "react";

// Spec .fab — the one global action: glowing violet +, → Add Transaction.
const Fab = ({ onPress }: { onPress: () => void }) => (
  <Pressable onPress={onPress} style={styles.fab} accessibilityLabel="Add transaction">
    <LinearGradient
      colors={[...gradients.brand]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={[StyleSheet.absoluteFill, styles.fabRound]}
      pointerEvents="none"
    />
    <Icon name="add" size={26} color="surface" />
  </Pressable>
);

const HomeScreen = () => {

  const router = useRouter();
  const { bottom } = useSafeAreaInsets();

  const userName = useSession((s) => s.user?.name);

  const { data: dashboardSummary, loading: summaryLoading, error: summaryError, refetch: summaryRefetch } = useDashboardSummary();

  // The three previews (action queue / motivation / recency). Composed client-side
  // from the live list endpoints — same shapes the eventual GET /dashboard returns,
  // so this stays contract-honest.
  const { items: bills, refetch: billsRefetch } = useBills();
  const { items: goals, refetch: goalsRefetch } = useGoals();
  const { items: transactions, refetch: transactionsRefetch } = useTransactions();

  useFocusEffect(useCallback(() => {
    summaryRefetch();
    billsRefetch();
    goalsRefetch();
    transactionsRefetch();
  }, [summaryRefetch, billsRefetch, goalsRefetch, transactionsRefetch]));

  // Action queue — overdue first, then the nearest upcoming, capped at 3.
  const billGroups = groupBills(bills);
  const billQueue = [...billGroups.overdue, ...billGroups.upcoming].slice(0, 3);

  // Motivation — the two nearest active (not-yet-achieved) goals.
  const goalPreview = sortGoals(goals.filter((g) => g.saved < g.target)).slice(0, 2);

  // Recency — the three most recent transactions.
  const recentTransactions = [...transactions]
    .sort((a, b) => new Date(b.occurredAt as string).getTime() - new Date(a.occurredAt as string).getTime())
    .slice(0, 3);

  // The one caption we can state truthfully today: savings rate (values-in-hand).
  // Income/Expenses/Net-Worth deltas need last-month data — deferred with captions.
  const savingsCaption = dashboardSummary && dashboardSummary.income > 0
    ? `${Math.round((dashboardSummary.savings / dashboardSummary.income) * 100)}% saved`
    : undefined;

  if (summaryError) {
    return (
      <ScreenScaffold title="Dashboard">
        <ErrorState message={summaryError} onRetry={summaryRefetch} />
      </ScreenScaffold>
    )
  }

  if (summaryLoading && !dashboardSummary) {
    return (
      <ScreenScaffold title="Dashboard">
        <View>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonState key={i} height={64} borderRadius={radius.md} />
          ))}
        </View>
      </ScreenScaffold>
    )
  }

  if (!dashboardSummary) {
    return null;
  }

  return (
    <ScreenScaffold
      header={
        <AppHeader
          name={userName ?? ""}
          onBellPress={() => console.log("Bell pressed")}
        />
      }
      floating={
        <View style={[styles.fabWrap, { bottom: bottom + spacing.lg }]}>
          <Fab onPress={() => router.push("/add-transaction")} />
        </View>
      }
    >
      <HealthScoreCard
        score={dashboard.healthScore}
        rating={dashboard.rating}
        stats={[
          { label: "Savings", value: "Good" },
          { label: "Budget", value: "On Track" },
          { label: "Debt", value: "Low" },
        ]}
      />

      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <SummaryCard
            icon="income"
            iconColor="success"
            iconBg="successSoft"
            label="Income"
            amount={formatMoney(dashboardSummary.income)}
          />
          <SummaryCard
            icon="expenses"
            iconColor="danger"
            iconBg="dangerSoft"
            label="Expenses"
            amount={formatMoney(dashboardSummary.expenses)}
          />
        </View>

        <View style={styles.gridRow}>
          <SummaryCard
            icon="wallet"
            iconColor="info"
            iconBg="infoSoft"
            label="Savings"
            amount={formatMoney(dashboardSummary.savings)}
            caption={savingsCaption}
            captionColor="info"
          />
          <SummaryCard
            icon="investments"
            iconColor="primary"
            iconBg="accentSoft"
            label="Net Worth"
            amount={formatMoney(dashboardSummary.netWorth)}
          />
        </View>
      </View>

      {billQueue.length > 0 && (
        <View style={styles.section}>
          <SectionHeader label="UPCOMING BILLS" onAction={() => router.push("/bills")} />
          {billQueue.map((bill) => (
            <BillRow key={bill._id} bill={bill} onPress={() => router.push("/bills")} />
          ))}
        </View>
      )}

      {goalPreview.length > 0 && (
        <View style={styles.section}>
          <SectionHeader label="SAVINGS GOALS" onAction={() => router.push("/goals")} />
          {goalPreview.map((goal) => (
            <GoalCard key={goal._id} goal={goal} onPress={() => router.push("/goals")} />
          ))}
        </View>
      )}

      {recentTransactions.length > 0 && (
        <View style={styles.section}>
          <SectionHeader label="RECENT TRANSACTIONS" actionLabel="See all" onAction={() => router.push("/activity")} />
          {recentTransactions.map((transaction) => (
            <TransactionRow key={transaction._id} transaction={transaction} onPress={() => router.push("/activity")} />
          ))}
        </View>
      )}

    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  grid: {
    gap: 12, // spec .grid2 gap × device scale
  },
  section: {
    gap: spacing.md,
  },
  gridRow: {
    flexDirection: "row",
    gap: 12,
  },
  fabWrap: {
    position: "absolute",
    right: 20,
  },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    // spec: 0 8px 24px rgba(109,92,255,.55)
    shadowColor: "#6D5CFF",
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  fabRound: {
    borderRadius: 29,
  },
});

export default HomeScreen;
