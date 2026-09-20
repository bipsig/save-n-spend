import { StyleSheet, View } from "react-native";
import AppHeader from "@/components/shell/AppHeader";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import SummaryCard from "@/components/data/SummaryCard";
import HealthScoreCard from "@/components/data/HealthScoreCard";
import SafeToSpendCard from "@/components/data/SafeToSpendCard";
import GetStartedCard from "@/components/data/GetStartedCard";
import QuickLogRow from "@/components/data/QuickLogRow";
import SpendingSnapshotCard from "@/components/data/SpendingSnapshotCard";
import BudgetsAtAGlanceCard from "@/components/data/BudgetsAtAGlanceCard";
import BillsGlanceCard from "@/components/data/BillsGlanceCard";
import ForYouCarousel, { FOR_YOU_SLIDE_HEIGHT } from "@/components/data/ForYouCarousel";
import HighlightCard from "@/components/data/HighlightCard";
import SectionHeader from "@/components/ui/SectionHeader";
import Fab from "@/components/ui/Fab";
import TransactionRow from "@/components/rows/TransactionRow";
import NetWorthSheet from "@/components/sheets/NetWorthSheet";
import { usePrivacyMask } from "@/lib/money";
import { radius, spacing } from "@/theme";
import { useFocusEffect, useRouter } from "expo-router";
import { useDashboardSummary, useDashboardInsights } from "@/lib/dashboard";
import GoalWatchSlide from "@/components/data/GoalWatchSlide";
import NoSpendDaysSlide from "@/components/data/NoSpendDaysSlide";
import WeekdayHeatmapSlide from "@/components/data/WeekdayHeatmapSlide";
import { useHealthScore } from "@/lib/health";
import { useBills, owedThroughMonth } from "@/lib/bills";
import { useGoals } from "@/lib/goals";
import { useTransactions } from "@/lib/transactions";
import { useInsights } from "@/lib/insights";
import { useHighlights } from "@/lib/highlights";
import { useBudgets, budgetTotals, currentMonth } from "@/lib/budgets";
import { projectSafeToSpend } from "@/lib/forecast";
import { milestoneCrossed } from "@/lib/netWorthMilestone";
import NetWorthMilestoneBanner from "@/components/data/NetWorthMilestoneBanner";
import { currentPeriodKey } from "@/lib/reviews";
import { rangeNavLabel } from "@/lib/dateRange";
import ReviewReadyBanner from "@/components/data/ReviewReadyBanner";
import { appZone, calendarDate, calendarDaysBetween, calendarToday } from "@/lib/zone";
import { buildSteps, progressOf } from "@/lib/onboarding";
import type { OnboardingStep } from "@/lib/onboarding";
import { useSession } from "@/store/session";
import { useSettings } from "@/store/settings";
import { useAccountStore } from "@/store/accounts";
import { useOutbox } from "@/store/outbox";
import { useLastOpened } from "@/store/lastOpened";
import EmergencyFundCard from "@/components/data/EmergencyFundCard";
import SinceLastOpenedCard from "@/components/data/SinceLastOpenedCard";
import WeekPulseRow from "@/components/data/WeekPulseRow";
import PaceCard from "@/components/data/PaceCard";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import SkeletonState from "@/components/states/SkeletonState";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { ITransaction } from "@save-n-spend/types";

const HomeScreen = () => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below

  const router = useRouter();
  const netWorthRef = useRef<BottomSheetModal>(null);

  const userName = useSession((s) => s.user?.name);
  const userId = useSession((s) => s.user?._id);

  // Read once at mount and held for the whole session (see store/lastOpened) — the
  // moment this specific screen instance's own digest is anchored to.
  const previousOpenedAt = useLastOpened((s) => s.previousOpenedAt);
  const { data: dashboardSummary, loading: summaryLoading, error: summaryError, refetch: summaryRefetch } = useDashboardSummary(previousOpenedAt);

  // The three previews (action queue / motivation / recency), composed client-side from the
  // live list endpoints — the same shapes an eventual GET /dashboard would return.
  const { items: bills, loading: billsLoading, refetch: billsRefetch } = useBills();
  const { items: goals, loading: goalsLoading, refetch: goalsRefetch } = useGoals();
  const { items: transactions, loading: transactionsLoading, refetch: transactionsRefetch } = useTransactions();

  // Feeds both the Get started checklist and the Safe to spend card below — no month
  // param, so the server's own default (the current month) is what comes back.
  const { items: budgets, loading: budgetsLoading, refetch: budgetsRefetch } = useBudgets();
  const accounts = useAccountStore((s) => s.list);
  const accountsLoaded = useAccountStore((s) => s.loaded);

  // Its own request, not a field on the summary: the summary describes a named month and the
  // score the trailing 90 days as of now, so one response would span two windows.
  const { data: health, refetch: healthRefetch } = useHealthScore();

  // Feeds the Spending Snapshot's top categories — the same window Insights itself opens
  // on, so the two never disagree about what "this month" means.
  const { data: insights, refetch: insightsRefetch } = useInsights("month", 0);

  // The same ranked, dismissible list Highlights/Insights already show — the dashboard
  // just takes the single worst warning and the single best win off the top rather than
  // re-deriving anything.
  const { highlights, dismiss: dismissHighlight, refetch: highlightsRefetch } = useHighlights();

  // The carousel's genuinely-new slides — a goal's ETA, a no-spend-day count, a weekday
  // pattern. Its own request, ranked/omit-shaped rather than the scalars the summary
  // above deals in.
  const { data: dashboardInsights, refetch: dashboardInsightsRefetch } = useDashboardInsights();

  // Queued transactions waiting on this phone — a stable selector (the raw items array),
  // mapped to displayable rows in a memo rather than in the selector itself, so this
  // doesn't re-render on every unrelated store change.
  const pendingItems = useOutbox((s) => s.items);
  const lastDrainedAt = useOutbox((s) => s.lastDrainedAt);
  const pendingTransactions = useMemo(
    () => pendingItems.map((item) => ({ ...item.payload, _id: item.clientId, clientId: item.clientId }) as unknown as ITransaction),
    [pendingItems]
  );
  const pendingClientIds = useMemo(() => new Set(pendingItems.map((item) => item.clientId)), [pendingItems]);

  useFocusEffect(useCallback(() => {
    summaryRefetch();
    healthRefetch();
    billsRefetch();
    goalsRefetch();
    transactionsRefetch();
    budgetsRefetch();
    insightsRefetch();
    highlightsRefetch();
    dashboardInsightsRefetch();
    // Accounts are NOT refetched here: every write that can move a balance — the
    // mutations in `lib/accounts`, and transaction create/edit/delete in
    // add-transaction.tsx / TransactionDetailSheet — reloads the store itself, so a
    // focus reload would be a second request for an already-correct list.
  }, [summaryRefetch, healthRefetch, billsRefetch, goalsRefetch, transactionsRefetch, budgetsRefetch, insightsRefetch, highlightsRefetch, dashboardInsightsRefetch]));

  // A drain can land while the dashboard is already on screen, not only on the way back
  // to it — the focus effect above wouldn't otherwise catch that.
  useEffect(() => {
    if (lastDrainedAt) transactionsRefetch();
  }, [lastDrainedAt, transactionsRefetch]);

  // Pull-to-refresh: everything the focus effect reloads, plus accounts — which that
  // effect deliberately skips (every balance-moving write already reloads the store
  // itself) but a manual "get me the truth right now" pull should still cover.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        summaryRefetch(),
        healthRefetch(),
        billsRefetch(),
        goalsRefetch(),
        transactionsRefetch(),
        budgetsRefetch(),
        insightsRefetch(),
        highlightsRefetch(),
        dashboardInsightsRefetch(),
        useAccountStore.getState().load().catch(() => {}),
      ]);
    }
    finally {
      setRefreshing(false);
    }
  };

  const dismissedBy = useSettings((s) => s.getStartedDismissed);
  const settingsHydrated = useSettings((s) => s.hydrated);
  const updateSettings = useSettings((s) => s.update);
  const netWorthMilestoneSeen = useSettings((s) => s.netWorthMilestoneSeen);
  const lastReviewedPeriod = useSettings((s) => s.lastReviewedPeriod);

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

  // Remaining budget minus what unpaid bills are still going to draw from this month's
  // cash — the one figure that's actually actionable "right now", so it leads the
  // dashboard. Not clamped: a negative number is the honest signal this exists to give.
  const month = currentMonth();
  const budgetTotalsThisMonth = budgetTotals(budgets, month);
  const safeToSpend = budgetTotalsThisMonth.remaining - owedThroughMonth(bills, month);
  const dailySafeToSpend = budgetTotalsThisMonth.daysLeft > 0
    ? Math.round(safeToSpend / budgetTotalsThisMonth.daysLeft)
    : safeToSpend;
  // Null when there isn't enough of the month yet, or it's already closed — the card
  // and the week pulse below both fall back to stating today's figure alone.
  const forecast = projectSafeToSpend(budgets, bills, month);
  // This MONTH's income-so-far against expenses-so-far plus the forecast's own daily
  // rate projected across the days left — not the week's figures, which the pulse row
  // states on their own. Income is never projected forward (see lib/forecast) — it's
  // typically lumpy, so income-to-date only ever understates likely savings, the safer
  // direction to be wrong in.
  const savingsPace = forecast && dashboardSummary
    ? dashboardSummary.income - (dashboardSummary.expenses + forecast.dailyBurnRate * budgetTotalsThisMonth.daysLeft)
    : undefined;

  // Null with fewer than 2 trend points — nothing to compare against yet, same as the
  // sparkline's own floor.
  const netWorthTrend = dashboardSummary?.netWorthTrend;
  const netWorthMilestone = netWorthTrend && netWorthTrend.length >= 2
    ? milestoneCrossed(netWorthTrend[netWorthTrend.length - 2].total, netWorthTrend[netWorthTrend.length - 1].total, netWorthMilestoneSeen)
    : null;

  // Marked "seen" the moment it's shown, not only if tapped — a celebration that
  // reappears every reload because it was never acknowledged would stop feeling rare.
  useEffect(() => {
    if (netWorthMilestone !== null) updateSettings({ netWorthMilestoneSeen: netWorthMilestone });
  }, [netWorthMilestone, updateSettings]);

  // The period that just closed, week and month independently — a new month is also a
  // new week, so both can be unseen at once; month wins that day (see
  // ReviewReadyBanner's own doc comment). Never more than one banner shown at a time.
  const closedMonthKey = currentPeriodKey("month");
  const closedWeekKey = currentPeriodKey("week");
  const reviewBanner =
    closedMonthKey && closedMonthKey !== lastReviewedPeriod.month
      ? { period: "month" as const, key: closedMonthKey }
      : closedWeekKey && closedWeekKey !== lastReviewedPeriod.week
        ? { period: "week" as const, key: closedWeekKey }
        : null;

  // Same "seen the moment it's shown" convention as the net-worth milestone above.
  useEffect(() => {
    if (reviewBanner) {
      updateSettings({ lastReviewedPeriod: { ...lastReviewedPeriod, [reviewBanner.period]: reviewBanner.key } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewBanner?.period, reviewBanner?.key]);

  // Recency — the three most recent transactions, queued ones included so an offline
  // capture shows up here immediately rather than waiting for a sync that may be minutes
  // away.
  const recentTransactions = [...pendingTransactions, ...transactions]
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
          streakDays={dashboardSummary?.currentStreak}
        />
      }
      floating={
        <Fab onPress={() => router.push("/add-transaction")} />
      }
      onRefresh={handleRefresh}
      refreshing={refreshing}
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

      {/* Anchored to THIS phone's own last visit, not the calendar — absent on a first-
          ever launch (nothing to compare against yet) and whenever the server hasn't
          echoed the digest back (an older cached response, or the request still
          in flight with the previous, unpersonalised query). */}
      {previousOpenedAt && dashboardSummary.sinceLastOpened && (
        <SinceLastOpenedCard
          previousOpenedAt={previousOpenedAt}
          transactions={dashboardSummary.sinceLastOpened.transactions}
          spent={dashboardSummary.sinceLastOpened.spent}
        />
      )}

      {/* Absent until it has loaded rather than rendered as a placeholder: a score is a
          judgement, and a skeleton in the shape of one invites the user to read a number
          that isn't there yet. */}
      {health && (
        <HealthScoreCard health={health} onPress={() => router.push("/health")} />
      )}

      {/* One horizontally swipeable stack in place of several separate vertical cards —
          same signal (a highlight, a goal's pace, a pattern), without permanently
          claiming that much space when a brand-new account has none of it yet. */}
      <ForYouCarousel
        slides={[
          highlights.find((h) => h.severity === "warning") && (
            <HighlightCard
              highlight={highlights.find((h) => h.severity === "warning")!}
              onDismiss={dismissHighlight}
              minHeight={FOR_YOU_SLIDE_HEIGHT}
            />
          ),
          highlights.find((h) => h.severity === "win") && (
            <HighlightCard
              highlight={highlights.find((h) => h.severity === "win")!}
              onDismiss={dismissHighlight}
              minHeight={FOR_YOU_SLIDE_HEIGHT}
            />
          ),
          dashboardInsights?.forYou.goalWatch && (
            <GoalWatchSlide slice={dashboardInsights.forYou.goalWatch} />
          ),
          dashboardInsights?.forYou.noSpendDays !== null && dashboardInsights?.forYou.noSpendDays !== undefined && (
            <NoSpendDaysSlide
              noSpendDays={dashboardInsights.forYou.noSpendDays}
              daysElapsed={calendarToday(appZone()).getUTCDate()}
              avgDailySpendCurrent={insights?.avgDailySpendCurrent}
              avgDailySpendPrevious={insights?.avgDailySpendPrevious}
            />
          ),
          dashboardInsights?.forYou.weekdayHeatmap && (
            <WeekdayHeatmapSlide cells={dashboardInsights.forYou.weekdayHeatmap} />
          ),
        ]}
      />

      {/* All four together, right after the carousel — one reading of the month, not
          split across the screen. Every tile still leads to where its figure comes
          from: the two halves to their own transactions, savings to the trend that
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
            destination="Activity"
            trend={dashboardSummary.flowTrend.map((point) => point.income)}
          />
          <SummaryCard
            icon="expenses"
            iconColor="danger"
            iconBg="dangerSoft"
            label="Expenses"
            amount={dashboardSummary.expenses}
            onPress={() => openActivity("expense")}
            destination="Activity"
            trend={dashboardSummary.flowTrend.map((point) => point.expense)}
            trendGoodDirection="down"
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
            destination="Insights"
            trend={dashboardSummary.flowTrend.map((point) => point.income - point.expense)}
          />
          <SummaryCard
            icon="investments"
            iconColor="primary"
            iconBg="accentSoft"
            label="Net Worth"
            amount={dashboardSummary.netWorth}
            onPress={accounts.length > 0 ? () => netWorthRef.current?.present() : undefined}
            destination="your accounts"
            trend={netWorthTrend?.map((point) => point.total)}
          />
        </View>
      </View>

      {netWorthMilestone !== null && (
        <NetWorthMilestoneBanner
          milestone={netWorthMilestone}
          onPress={() => netWorthRef.current?.present()}
        />
      )}

      {reviewBanner && (
        <ReviewReadyBanner
          label={rangeNavLabel(reviewBanner.period, -1).toLowerCase()}
          onPress={() => router.push({ pathname: "/review", params: { period: reviewBanner.period, offset: "-1" } })}
        />
      )}

      {/* Leads even the health score — a daily "what can I spend" number is checked far
          more often than a slower, reflective one. Absent only while budgets/bills are
          still loading, since its own empty state (no budget set) is a real answer, not
          a placeholder. */}
      {!budgetsLoading && !billsLoading && (
        <SafeToSpendCard
          hasBudgets={budgets.length > 0}
          safeToSpend={safeToSpend}
          dailySafeToSpend={dailySafeToSpend}
          daysLeft={budgetTotalsThisMonth.daysLeft}
          forecast={forecast}
          onPress={budgets.length > 0 ? () => router.push("/budget") : undefined}
          onSetBudget={() => router.push("/budget")}
        />
      )}

      {health && <EmergencyFundCard runwayMonths={health.runwayMonths} />}

      <QuickLogRow />

      {insights && (
        <SpendingSnapshotCard
          byCategory={insights.byCategory}
          biggestExpense={
            dashboardSummary.biggestExpense
              ? {
                title: dashboardSummary.biggestExpense.title,
                amount: dashboardSummary.biggestExpense.amount,
                daysAgo: calendarDaysBetween(
                  calendarDate(new Date(dashboardSummary.biggestExpense.occurredAt), appZone()),
                  calendarToday(appZone()),
                ),
              }
              : null
          }
          onPress={() => router.push("/insights")}
        />
      )}

      {!budgetsLoading && (
        <BudgetsAtAGlanceCard items={budgets} onPress={() => router.push("/budget")} />
      )}

      {/* Under the month's figures: those are a reading of thirty days, which doesn't change
          between two glances, while these three rows answer "did that go in?" — the question
          the app is usually opened to check. */}
      {recentTransactions.length > 0 && (
        <View style={styles.section}>
          <SectionHeader label="RECENT TRANSACTIONS" actionLabel="See all" onAction={() => router.push("/activity")} />
          {recentTransactions.map((transaction) => (
            <TransactionRow
              key={transaction._id}
              transaction={transaction}
              pending={!!transaction.clientId && pendingClientIds.has(transaction.clientId)}
              onPress={() => router.push("/activity")}
            />
          ))}
        </View>
      )}

      {dashboardInsights?.pace && <PaceCard pace={dashboardInsights.pace} />}

      <WeekPulseRow
        income={dashboardSummary.weekIncome}
        expense={dashboardSummary.weekExpense}
        savingsPace={savingsPace}
      />

      {!billsLoading && (
        <BillsGlanceCard items={bills} onPress={() => router.push("/bills")} />
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

      <NetWorthSheet ref={netWorthRef} netWorth={dashboardSummary.netWorth} trend={netWorthTrend} />
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
