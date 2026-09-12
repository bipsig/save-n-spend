import { StyleSheet, View } from "react-native";
import AppHeader from "@/components/shell/AppHeader";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import SummaryCard from "@/components/data/SummaryCard";
import HealthScoreCard from "@/components/data/HealthScoreCard";
import GetStartedCard from "@/components/data/GetStartedCard";
import SectionHeader from "@/components/ui/SectionHeader";
import Fab from "@/components/ui/Fab";
import BillRow from "@/components/rows/BillRow";
import GoalCard from "@/components/rows/GoalCard";
import TransactionRow from "@/components/rows/TransactionRow";
import NetWorthSheet from "@/components/sheets/NetWorthSheet";
import { usePrivacyMask } from "@/lib/money";
import { radius, spacing } from "@/theme";
import { useFocusEffect, useRouter } from "expo-router";
import { useDashboardSummary } from "@/lib/dashboard";
import { useHealthScore } from "@/lib/health";
import { useBills, groupBills } from "@/lib/bills";
import { useGoals, sortGoals } from "@/lib/goals";
import { useTransactions } from "@/lib/transactions";
import { useBudgets } from "@/lib/budgets";
import { buildSteps, progressOf } from "@/lib/onboarding";
import type { OnboardingStep } from "@/lib/onboarding";
import { useSession } from "@/store/session";
import { useSettings } from "@/store/settings";
import { useAccountStore } from "@/store/accounts";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import SkeletonState from "@/components/states/SkeletonState";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";

const HomeScreen = () => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below

  const router = useRouter();
  const netWorthRef = useRef<BottomSheetModal>(null);

  const userName = useSession((s) => s.user?.name);
  const userId = useSession((s) => s.user?._id);

  const { data: dashboardSummary, loading: summaryLoading, error: summaryError, refetch: summaryRefetch } = useDashboardSummary();

  // The three previews (action queue / motivation / recency), composed client-side from the
  // live list endpoints — the same shapes an eventual GET /dashboard would return.
  const { items: bills, loading: billsLoading, refetch: billsRefetch } = useBills();
  const { items: goals, loading: goalsLoading, refetch: goalsRefetch } = useGoals();
  const { items: transactions, loading: transactionsLoading, refetch: transactionsRefetch } = useTransactions();

  // Budgets are here only for the Get started checklist; the dashboard has no budget
  // section. Without it the checklist would have to guess at a step it can know.
  const { items: budgets, loading: budgetsLoading, refetch: budgetsRefetch } = useBudgets();
  const accounts = useAccountStore((s) => s.list);
  const accountsLoaded = useAccountStore((s) => s.loaded);

  // Its own request, not a field on the summary: the summary describes a named month and the
  // score the trailing 90 days as of now, so one response would span two windows.
  const { data: health, refetch: healthRefetch } = useHealthScore();

  useFocusEffect(useCallback(() => {
    summaryRefetch();
    healthRefetch();
    billsRefetch();
    goalsRefetch();
    transactionsRefetch();
    budgetsRefetch();
    // Accounts are NOT refetched here: every write that can move a balance — the
    // mutations in `lib/accounts`, and transaction create/edit/delete in
    // add-transaction.tsx / TransactionDetailSheet — reloads the store itself, so a
    // focus reload would be a second request for an already-correct list.
  }, [summaryRefetch, healthRefetch, billsRefetch, goalsRefetch, transactionsRefetch, budgetsRefetch]));

  const dismissedBy = useSettings((s) => s.getStartedDismissed);
  const settingsHydrated = useSettings((s) => s.hydrated);
  const updateSettings = useSettings((s) => s.update);

  const progress = progressOf(buildSteps({ transactions, accounts, budgets, bills, goals }));

  // Every list hook starts at `loading: true` with an empty array, which for one frame looks
  // like a brand-new account, so an established user would see the checklist flash. Latched
  // rather than read from `loading`, which `useFocusEffect` re-enters on every focus.
  const listsSettled =
    !transactionsLoading && !budgetsLoading && !billsLoading && !goalsLoading && accountsLoaded;
  const [listsReady, setListsReady] = useState(false);
  useEffect(() => {
    if (listsSettled) setListsReady(true);
  }, [listsSettled]);

  const showGetStarted =
    listsReady &&
    settingsHydrated &&
    !progress.allDone &&
    !(userId && dismissedBy.includes(userId));

  const dismissGetStarted = () => {
    if (!userId) return;
    updateSettings({ getStartedDismissed: [...dismissedBy, userId] });
  };

  // A step routes to the screen that owns it, each of which already opens on its own empty
  // state with the matching CTA — so the checklist never has to drive a sheet from here.
  const openStep = (step: OnboardingStep) => router.push(step.route);

  // Activity, already narrowed to the tile that was tapped: the same month the figure was
  // summed over, and only that half of it. `focus` is a nonce, so a second tap re-applies
  // the filter even if it was changed by hand in between (see the Activity screen).
  const openActivity = (type: "income" | "expense") =>
    router.push({ pathname: "/activity", params: { type, range: "month", focus: String(Date.now()) } });

  // Action queue — overdue first, then the nearest upcoming, capped at 3.
  const billGroups = groupBills(bills);
  const billQueue = [...billGroups.overdue, ...billGroups.upcoming].slice(0, 3);

  // Motivation — the two nearest active (not-yet-achieved) goals.
  const goalPreview = sortGoals(goals.filter((g) => g.saved < g.target)).slice(0, 2);

  // Recency — the three most recent transactions.
  const recentTransactions = [...transactions]
    .sort((a, b) => new Date(b.occurredAt as string).getTime() - new Date(a.occurredAt as string).getTime())
    .slice(0, 3);

  // Savings rate is the only delta stated from values in hand; the rest need last month.
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
          onBellPress={() => router.push("/notifications")}
        />
      }
      floating={
        <Fab onPress={() => router.push("/add-transaction")} />
      }
    >
      {/* First on the screen, above the score and the tiles. For an account with nothing
          in it yet, this is the only thing here that can be acted on — everything below
          is a reading of data that does not exist. It retires itself once the five steps
          are done (see lib/onboarding). */}
      {showGetStarted && (
        <GetStartedCard
          progress={progress}
          onStepPress={openStep}
          onDismiss={dismissGetStarted}
        />
      )}

      {/* Absent until it has loaded rather than rendered as a placeholder: a score is a
          judgement, and a skeleton in the shape of one invites the user to read a number
          that isn't there yet. */}
      {health && (
        <HealthScoreCard health={health} onPress={() => router.push("/health")} />
      )}

      {/* The month, under the verdict that reads it. Every tile leads to where its figure
          comes from — the two halves to their own transactions, savings to the trend that
          explains the gap, net worth to the accounts it sums. */}
      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <SummaryCard
            icon="income"
            iconColor="success"
            iconBg="successSoft"
            label="Income"
            amount={dashboardSummary.income}
            onPress={() => openActivity("income")}
          />
          <SummaryCard
            icon="expenses"
            iconColor="danger"
            iconBg="dangerSoft"
            label="Expenses"
            amount={dashboardSummary.expenses}
            onPress={() => openActivity("expense")}
          />
        </View>

        <View style={styles.gridRow}>
          {/* Insights rather than Goals: this is income minus expenses for the month, and
              the screen that breaks it down is the one with the trend and the savings rate.
              Goals are what savings are FOR, and they have their own section below. */}
          <SummaryCard
            icon="wallet"
            iconColor="info"
            iconBg="infoSoft"
            label="Savings"
            amount={dashboardSummary.savings}
            caption={savingsCaption}
            captionColor="info"
            onPress={() => router.push("/insights")}
          />
          <SummaryCard
            icon="investments"
            iconColor="primary"
            iconBg="accentSoft"
            label="Net Worth"
            amount={dashboardSummary.netWorth}
            onPress={accounts.length > 0 ? () => netWorthRef.current?.present() : undefined}
          />
        </View>
      </View>

      {/* Under the month's figures: those are a reading of thirty days, which doesn't change
          between two glances, while these three rows answer "did that go in?" — the question
          the app is usually opened to check. */}
      {recentTransactions.length > 0 && (
        <View style={styles.section}>
          <SectionHeader label="RECENT TRANSACTIONS" actionLabel="See all" onAction={() => router.push("/activity")} />
          {recentTransactions.map((transaction) => (
            <TransactionRow key={transaction._id} transaction={transaction} onPress={() => router.push("/activity")} />
          ))}
        </View>
      )}

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

      {/* The floor of the screen when there is genuinely nothing to list. Reachable two
          ways — a fresh account that dismissed the checklist, and one whose transactions
          have all been deleted — and in both the dashboard would otherwise end in four
          zeroes and blank space, which reads as a failed load rather than an empty book. */}
      {listsReady && transactions.length === 0 && !showGetStarted && (
        <EmptyState
          icon="add"
          title="Nothing recorded yet"
          subtitle="Add a transaction and your dashboard, trends and health score start filling in."
          actionLabel="Add transaction"
          onAction={() => router.push("/add-transaction")}
        />
      )}

      <NetWorthSheet ref={netWorthRef} netWorth={dashboardSummary.netWorth} />
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
});

export default HomeScreen;
