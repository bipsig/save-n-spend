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
import formatMoney, { usePrivacyMask } from "@/lib/money";
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
import { useCallback, useEffect, useState } from "react";

const HomeScreen = () => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below

  const router = useRouter();

  const userName = useSession((s) => s.user?.name);
  const userId = useSession((s) => s.user?._id);

  const { data: dashboardSummary, loading: summaryLoading, error: summaryError, refetch: summaryRefetch } = useDashboardSummary();

  // The three previews (action queue / motivation / recency). Composed client-side
  // from the live list endpoints — same shapes the eventual GET /dashboard returns,
  // so this stays contract-honest.
  const { items: bills, loading: billsLoading, refetch: billsRefetch } = useBills();
  const { items: goals, loading: goalsLoading, refetch: goalsRefetch } = useGoals();
  const { items: transactions, loading: transactionsLoading, refetch: transactionsRefetch } = useTransactions();

  // Budgets are here only for the Get started checklist — the dashboard itself has no
  // budget section. Cheap enough to be worth it: without it the checklist would have to
  // guess at a step it can just as easily know.
  const { items: budgets, loading: budgetsLoading, refetch: budgetsRefetch } = useBudgets();
  const accounts = useAccountStore((s) => s.list);
  const accountsLoaded = useAccountStore((s) => s.loaded);

  // Its own request rather than a field on the summary: the summary describes a named
  // month, the score describes the trailing 90 days as of now. One response carrying
  // both would have two fields measured over two different spans.
  const { data: health, refetch: healthRefetch } = useHealthScore();

  useFocusEffect(useCallback(() => {
    summaryRefetch();
    healthRefetch();
    billsRefetch();
    goalsRefetch();
    transactionsRefetch();
    budgetsRefetch();
    // Accounts are NOT refetched here. Every mutation in `lib/accounts` reloads the
    // store itself, so the checklist's account row already ticks the moment one is
    // added — a focus reload would be a second request per visit for a list that is
    // already correct.
  }, [summaryRefetch, healthRefetch, billsRefetch, goalsRefetch, transactionsRefetch, budgetsRefetch]));

  // ---- Get started checklist ------------------------------------------------
  const dismissedBy = useSettings((s) => s.getStartedDismissed);
  const settingsHydrated = useSettings((s) => s.hydrated);
  const updateSettings = useSettings((s) => s.update);

  const progress = progressOf(buildSteps({ transactions, accounts, budgets, bills, goals }));

  // Every list hook starts at `loading: true` with an empty array, which for one frame
  // is indistinguishable from a brand-new account — so an established user would see the
  // checklist flash before their data landed. Latched into state rather than read from
  // `loading` directly: `useFocusEffect` re-enters loading on every focus, and gating on
  // it would blink the card off and back on each time the tab was revisited.
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

  // A step routes to the screen that owns it, and each of those screens already opens
  // on its own empty state with the matching CTA — so the tap lands somewhere that
  // explains itself, rather than needing the checklist to drive a sheet from here.
  const openStep = (step: OnboardingStep) => router.push(step.route);

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

      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <SummaryCard
            icon="income"
            iconColor="success"
            iconBg="successSoft"
            label="Income"
            amount={dashboardSummary.income}
          />
          <SummaryCard
            icon="expenses"
            iconColor="danger"
            iconBg="dangerSoft"
            label="Expenses"
            amount={dashboardSummary.expenses}
          />
        </View>

        <View style={styles.gridRow}>
          <SummaryCard
            icon="wallet"
            iconColor="info"
            iconBg="infoSoft"
            label="Savings"
            amount={dashboardSummary.savings}
            caption={savingsCaption}
            captionColor="info"
          />
          <SummaryCard
            icon="investments"
            iconColor="primary"
            iconBg="accentSoft"
            label="Net Worth"
            amount={dashboardSummary.netWorth}
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
