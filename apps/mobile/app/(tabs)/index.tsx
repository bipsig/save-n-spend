import { StyleSheet, View } from "react-native";
import AppHeader from "@/components/shell/AppHeader";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import SummaryCard from "@/components/data/SummaryCard";
import OpenTripCard from "@/components/data/OpenTripCard";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { AppText } from "@/components/ui/AppText";
import HealthScoreCard from "@/components/data/HealthScoreCard";
import SafeToSpendCard from "@/components/data/SafeToSpendCard";
import GetStartedCard from "@/components/data/GetStartedCard";
import QuickLogRow from "@/components/data/QuickLogRow";
import SpendingSnapshotCard from "@/components/data/SpendingSnapshotCard";
import BudgetsAtAGlanceCard from "@/components/data/BudgetsAtAGlanceCard";
import BillsGlanceCard, { billsGlanceEmpty } from "@/components/data/BillsGlanceCard";
import ForYouCarousel, { FOR_YOU_SLIDE_HEIGHT } from "@/components/data/ForYouCarousel";
import HighlightCard from "@/components/data/HighlightCard";
import SectionHeader from "@/components/ui/SectionHeader";
import Fab from "@/components/ui/Fab";
import TransactionRow from "@/components/rows/TransactionRow";
import NetWorthSheet from "@/components/sheets/NetWorthSheet";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { homeTiles, tileSize, tileTargets } from "@/lib/homeTiles";
import { useTrips } from "@/lib/trips";
import { signTone } from "@/lib/signTone";
import { radius, spacing } from "@/theme";
import { useRouter } from "expo-router";
import { useDashboardSummary, useDashboardInsights } from "@/lib/dashboard";
import GoalWatchSlide from "@/components/data/GoalWatchSlide";
import NoSpendDaysSlide from "@/components/data/NoSpendDaysSlide";
import WeekdayHeatmapSlide from "@/components/data/WeekdayHeatmapSlide";
import { useHealthScore } from "@/lib/health";
import { useBills, owedAgainstBudgets } from "@/lib/bills";
import { useCategories } from "@/lib/categories";
import { useCashFlow } from "@/lib/cashFlow";
import CashFlowGlanceCard, { cashFlowGlanceEmpty } from "@/components/data/CashFlowGlanceCard";
import { useGoals } from "@/lib/goals";
import { useTransactions } from "@/lib/transactions";
import { useInsights } from "@/lib/insights";
import { useHighlights } from "@/lib/highlights";
import { useBudgets, budgetTotals, currentMonth } from "@/lib/budgets";
import { mergeScreenStates } from "@/lib/screenStates";
import { projectSafeToSpend } from "@/lib/forecast";
import { milestoneCrossed } from "@/lib/netWorthMilestone";
import NetWorthMilestoneBanner from "@/components/data/NetWorthMilestoneBanner";
import { currentPeriodKey } from "@/lib/reviews";
import { rangeNavLabel } from "@/lib/dateRange";
import ReviewReadyBanner from "@/components/data/ReviewReadyBanner";
import { appZone, calendarDate, calendarDaysBetween, calendarToday, dayKey } from "@/lib/zone";
import { buildSteps, progressOf } from "@/lib/onboarding";
import type { OnboardingStep } from "@/lib/onboarding";
import { useSession } from "@/store/session";
import { useSettings } from "@/store/settings";
import { useAccountStore } from "@/store/accounts";
import { useOutbox } from "@/store/outbox";
import { useLastOpened } from "@/store/lastOpened";
import { useSeen } from "@/store/seen";
import EmergencyFundCard from "@/components/data/EmergencyFundCard";
import SinceLastOpenedCard from "@/components/data/SinceLastOpenedCard";
import WeekPulseRow from "@/components/data/WeekPulseRow";
import PaceCard from "@/components/data/PaceCard";
import EmptyState from "@/components/states/EmptyState";
import HomeCard from "@/components/states/HomeCard";
import ScreenStates from "@/components/states/ScreenStates";
import SkeletonState from "@/components/states/SkeletonState";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { HomePeriod, ITransaction } from "@save-n-spend/types";
import { useVisible } from "@/lib/undo";

const PERIODS: { key: HomePeriod; label: string }[] = [
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "all", label: "All time" },
];

const HomeScreen = () => {
  const masked = usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below

  const router = useRouter();
  const netWorthRef = useRef<BottomSheetModal>(null);

  const userName = useSession((s) => s.user?.name);
  const userId = useSession((s) => s.user?._id);

  // Read once at mount and held for the whole session (see store/lastOpened) — the
  // moment this specific screen instance's own digest is anchored to.
  const previousOpenedAt = useLastOpened((s) => s.previousOpenedAt);
  // The four tiles' Month / Year / All time, kept across launches.
  const homePeriod = useSettings((s) => s.homePeriod);
  const updateSettings = useSettings((s) => s.update);
  const summaryQuery = useDashboardSummary(previousOpenedAt, homePeriod);
  const dashboardSummary = summaryQuery.data;

  // The three previews (action queue / motivation / recency), composed client-side from the
  // live list endpoints — the same shapes an eventual GET /dashboard would return.
  const billsQuery = useBills();
  const bills = billsQuery.items;
  const goalsQuery = useGoals();
  const goals = goalsQuery.items;
  const transactionsQuery = useTransactions();
  const transactions = useVisible("transaction", transactionsQuery.items);

  // Feeds both the Get started checklist and the Safe to spend card below — no month
  // param, so the server's own default (the current month) is what comes back.
  const budgetsQuery = useBudgets();
  const budgets = budgetsQuery.items;
  // Which bills a budget covers goes by category, children included.
  const categories = useCategories();
  const accounts = useAccountStore((s) => s.list);
  const accountsLoaded = useAccountStore((s) => s.loaded);

  // Its own request, not a field on the summary: the summary describes a named month and the
  // score the trailing 90 days as of now, so one response would span two windows.
  const healthQuery = useHealthScore();
  const health = healthQuery.data;

  // Feeds the Spending Snapshot's top categories — the same window Insights itself opens
  // on, so the two never disagree about what "this month" means.
  const insightsQuery = useInsights("month", 0);
  const insights = insightsQuery.data;

  // The same ranked, dismissible list Highlights/Insights already show — the dashboard
  // just takes the single worst warning and the single best win off the top rather than
  // re-deriving anything.
  const highlightsQuery = useHighlights();
  const { highlights, dismiss: dismissHighlight } = highlightsQuery;

  // The carousel's genuinely-new slides — a goal's ETA, a no-spend-day count, a weekday
  // pattern. Its own request, ranked/omit-shaped rather than the scalars the summary
  // above deals in.
  const dashboardInsightsQuery = useDashboardInsights();
  const dashboardInsights = dashboardInsightsQuery.data;

  // Open trips count nowhere until closed; Home shows each one's running share on its own.
  const openTrips = useVisible("trip", useTrips().data?.trips ?? []).filter((t) => t.status === "active");

  // Queued transactions waiting on this phone — a stable selector (the raw items array),
  // mapped to displayable rows in a memo rather than in the selector itself, so this
  // doesn't re-render on every unrelated store change.
  const pendingItems = useOutbox((s) => s.items);
  const pendingTransactions = useMemo(
    () => pendingItems.map((item) => ({ ...item.payload, _id: item.clientId, clientId: item.clientId }) as unknown as ITransaction),
    [pendingItems]
  );
  const pendingClientIds = useMemo(() => new Set(pendingItems.map((item) => item.clientId)), [pendingItems]);

  const cashFlowQuery = useCashFlow();
  const cashFlow = cashFlowQuery.data;

  // A card's state: an answer (live or saved) is on hand once it has a fetch time.
  const stateOf = (q: { error: string | null; fetchedAt: number | null; refetch: () => Promise<void> }) => ({
    hasData: q.fetchedAt !== null,
    error: q.error,
    refetch: q.refetch,
  });
  const summaryState = { ...summaryQuery, hasData: summaryQuery.fetchedAt !== null };
  const healthState = stateOf(healthQuery);
  const billsState = stateOf(billsQuery);
  const budgetsState = stateOf(budgetsQuery);
  const transactionsState = stateOf(transactionsQuery);
  const insightsState = stateOf(insightsQuery);
  const cashFlowState = stateOf(cashFlowQuery);
  const dashboardInsightsState = stateOf(dashboardInsightsQuery);
  const safeToSpendState = mergeScreenStates({ ...budgetsState, loading: false }, { ...billsState, loading: false });
  // Highlights or the dashboard's own slides are enough to fill it; it fails only with neither.
  const forYouState = {
    hasData: highlightsQuery.fetchedAt !== null || dashboardInsightsState.hasData,
    error: highlightsQuery.error ?? dashboardInsightsQuery.error,
    refetch: () => Promise.all([highlightsQuery.refetch(), dashboardInsightsQuery.refetch()]),
  };

  // Pull-to-refresh reloads every card, plus accounts: every balance-moving write already
  // reloads that store, but a pull asks for the truth right now.
  const handleRefresh = () => Promise.all([
    summaryQuery.refetch(),
    cashFlowQuery.refetch(),
    healthQuery.refetch(),
    billsQuery.refetch(),
    goalsQuery.refetch(),
    transactionsQuery.refetch(),
    budgetsQuery.refetch(),
    insightsQuery.refetch(),
    highlightsQuery.refetch(),
    dashboardInsightsQuery.refetch(),
    useAccountStore.getState().load().catch(() => {}),
  ]);

  // This account's own seen values (store/seen); nothing below decides or marks anything
  // until they are read, or a stored value would be overwritten by the defaults.
  const seenReady = useSeen((s) => !!userId && s.userId === userId);
  const getStartedDismissed = useSeen((s) => s.getStartedDismissed);
  const updateSeen = useSeen((s) => s.update);
  const netWorthMilestoneSeen = useSeen((s) => s.netWorthMilestoneSeen);
  const lastReviewedPeriod = useSeen((s) => s.lastReviewedPeriod);

  const progress = progressOf(buildSteps({ transactions, accounts, budgets, bills, goals }));

  // Every list hook starts with an empty array, which looks like a brand-new account, so the
  // checklist waits for a real answer from each (a failed one never counts as empty). Latched,
  // so a later failed refresh doesn't take it away again.
  const listsSettled =
    transactionsState.hasData && budgetsState.hasData && billsState.hasData && goalsQuery.fetchedAt !== null && accountsLoaded;
  const [listsReady, setListsReady] = useState(false);
  useEffect(() => {
    if (listsSettled) setListsReady(true);
  }, [listsSettled]);

  const showGetStarted =
    listsReady &&
    seenReady &&
    !progress.allDone &&
    !getStartedDismissed;

  const dismissGetStarted = () => updateSeen({ getStartedDismissed: true });

  // A step routes to the screen that owns it, each of which already opens on its own empty
  // state with the matching CTA — so the checklist never has to drive a sheet from here.
  const openStep = (step: OnboardingStep) => router.push(step.route);

  // Activity, already narrowed to the tile that was tapped: the same month the figure was
  // summed over, and only that half of it. `focus` is a nonce, so a second tap re-applies
  // the filter even if it was changed by hand in between (see the Activity screen).
  const targets = tileTargets(homePeriod);
  const openActivity = (type: "income" | "expense") =>
    router.push({ pathname: "/activity", params: { type, range: targets.activityRange, focus: String(Date.now()) } });

  // Remaining budget minus what unpaid bills are still going to draw from those budgets —
  // the one figure that's actually actionable "right now", so it leads the dashboard. Not
  // clamped: a negative number is the honest signal this exists to give.
  const month = currentMonth();
  const budgetTotalsThisMonth = budgetTotals(budgets, month);
  const billsOwed = owedAgainstBudgets(bills, budgets, categories, month).total;
  const safeToSpend = budgetTotalsThisMonth.remaining - billsOwed;
  const dailySafeToSpend = budgetTotalsThisMonth.daysLeft > 0
    ? Math.round(safeToSpend / budgetTotalsThisMonth.daysLeft)
    : safeToSpend;
  // Null when there isn't enough of the month yet, or it's already closed — the card
  // and the week pulse below both fall back to stating today's figure alone.
  const forecast = projectSafeToSpend(budgets, bills, categories, month);
  // This MONTH's income-so-far against expenses-so-far plus the forecast's own daily
  // rate projected across the days left — not the week's figures, which the pulse row
  // states on their own. Income is never projected forward (see lib/forecast) — it's
  // typically lumpy, so income-to-date only ever understates likely savings, the safer
  // direction to be wrong in.
  // This month's own figures close the flow series whatever the tiles' period is.
  const thisMonth = dashboardSummary?.flowTrend.at(-1);
  const savingsPace = forecast && thisMonth
    ? thisMonth.income - (thisMonth.expense + forecast.dailyBurnRate * budgetTotalsThisMonth.daysLeft)
    : undefined;

  // Null with fewer than 2 trend points — nothing to compare against yet, same as the
  // sparkline's own floor.
  const netWorthTrend = dashboardSummary?.netWorthTrend;
  const netWorthMilestone = seenReady && netWorthTrend && netWorthTrend.length >= 2
    ? milestoneCrossed(netWorthTrend[netWorthTrend.length - 2].total, netWorthTrend[netWorthTrend.length - 1].total, netWorthMilestoneSeen)
    : null;

  // Marked "seen" the moment it's shown, not only if tapped — a celebration that
  // reappears every reload because it was never acknowledged would stop feeling rare.
  useEffect(() => {
    if (netWorthMilestone !== null) updateSeen({ netWorthMilestoneSeen: netWorthMilestone });
  }, [netWorthMilestone, updateSeen]);

  // The period that just closed, week and month independently — a new month is also a
  // new week, so both can be unseen at once; month wins that day (see
  // ReviewReadyBanner's own doc comment). Never more than one banner shown at a time.
  const closedMonthKey = currentPeriodKey("month");
  const closedWeekKey = currentPeriodKey("week");
  const reviewBanner = !seenReady
    ? null
    : closedMonthKey && closedMonthKey !== lastReviewedPeriod.month
      ? { period: "month" as const, key: closedMonthKey }
      : closedWeekKey && closedWeekKey !== lastReviewedPeriod.week
        ? { period: "week" as const, key: closedWeekKey }
        : null;

  // Same "seen the moment it's shown" convention as the net-worth milestone above.
  useEffect(() => {
    if (reviewBanner) {
      updateSeen({ lastReviewedPeriod: { ...lastReviewedPeriod, [reviewBanner.period]: reviewBanner.key } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewBanner?.period, reviewBanner?.key]);

  // Recency — the three most recent transactions, queued ones included so an offline
  // capture shows up here immediately rather than waiting for a sync that may be minutes
  // away.
  const recentTransactions = [...pendingTransactions, ...transactions]
    .sort((a, b) => new Date(b.occurredAt as string).getTime() - new Date(a.occurredAt as string).getTime())
    .slice(0, 3);

  // Every figure holds each closed trip once, on its close day (trips=entries).
  const biggest = dashboardSummary ? (dashboardSummary.biggestEverydayExpense ?? dashboardSummary.biggestExpense) : null;
  const daily = dashboardInsights
    ? { noSpendDays: dashboardInsights.forYou.noSpendDays, weekdayHeatmap: dashboardInsights.forYou.weekdayHeatmap, pace: dashboardInsights.pace }
    : null;
  const averages = insights ? { current: insights.avgDailySpendCurrent, previous: insights.avgDailySpendPrevious } : null;

  const zone = appZone();
  const tiles = dashboardSummary
    ? homeTiles(dashboardSummary, {
      period: homePeriod,
      startDay: homePeriod !== "all" && dashboardSummary.periodStart ? dayKey(new Date(dashboardSummary.periodStart), zone) : null,
      firstDay: dashboardSummary.firstRecordAt ? dayKey(new Date(dashboardSummary.firstRecordAt), zone) : null,
      signedMoney: (paise) => formatMoney(paise, { sign: "always" }),
      masked,
    })
    : null;
  const size = dashboardSummary
    ? tileSize([dashboardSummary.income, dashboardSummary.expenses, dashboardSummary.savings, dashboardSummary.netWorth].map((p) => formatMoney(p)))
    : "lg";

  // One horizontally swipeable stack in place of several separate vertical cards — same
  // signal (a highlight, a goal's pace, a pattern), without permanently claiming that much
  // space when a brand-new account has none of it yet.
  const forYouSlides = [
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
    daily?.noSpendDays !== null && daily?.noSpendDays !== undefined && (
      <NoSpendDaysSlide
        noSpendDays={daily.noSpendDays}
        daysElapsed={calendarToday(appZone()).getUTCDate()}
        avgDailySpendCurrent={averages?.current}
        avgDailySpendPrevious={averages?.previous}
      />
    ),
    daily?.weekdayHeatmap && (
      <WeekdayHeatmapSlide cells={daily.weekdayHeatmap} />
    ),
  ];

  // The greeting header in every state (mockup 01), so nothing jumps when the summary lands.
  const header = (
    <AppHeader
      name={userName ?? ""}
      onBellPress={() => router.push("/notifications")}
      streakDays={dashboardSummary?.currentStreak}
    />
  );

  return (
    <ScreenScaffold
      header={header}
      floating={summaryState.hasData && <Fab onPress={() => router.push("/add-transaction")} />}
      states={summaryState}
      onRefresh={handleRefresh}
    >
      {/* The month summary is the screen: the full error only when it fails with nothing
          saved. Every other card keeps its own place when its request fails (HomeCard). */}
      <ScreenStates
        state={summaryState}
        skeleton={
          <View>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonState key={i} height={64} borderRadius={radius.md} />
            ))}
          </View>
        }
      >
      {() => dashboardSummary && tiles && (
      <>
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
          echoed the digest back (a saved copy never carries it, see lib/offlineSlot, or the
          request still in flight with the previous, unpersonalised query). */}
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
      <HomeCard title="Finance health score" state={healthState} skeletonHeight={132}>
        {health && <HealthScoreCard health={health} onPress={() => router.push("/health")} />}
      </HomeCard>

      <HomeCard
        title="For you"
        state={forYouState}
        empty={forYouSlides.every((slide) => !slide)}
        skeletonHeight={FOR_YOU_SLIDE_HEIGHT + 40}
      >
        <ForYouCarousel slides={forYouSlides} />
      </HomeCard>

      {/* All four together, right after the carousel — one reading of the month, not
          split across the screen. Every tile still leads to where its figure comes
          from: the two halves to their own transactions, savings to the trend that
          explains the gap, net worth to the accounts it sums. */}
      {/* The switch changes only the four tiles under it; everything else stays on now. */}
      <View style={styles.grid}>
        <View style={styles.scope}>
          <SegmentedControl
            segments={PERIODS}
            value={homePeriod}
            onChange={(p) => updateSettings({ homePeriod: p })}
            size="sm"
            accessibilityLabel="Period for the four figures"
          />
          <AppText size="xs" color="inkDim">{tiles.scope}</AppText>
        </View>
        <View style={styles.gridRow}>
          <SummaryCard
            icon="income"
            iconColor="success"
            iconBg="successSoft"
            label="Income"
            amount={dashboardSummary.income}
            size={size}
            caption={tiles.income?.text}
            captionColor={tiles.income?.tone}
            onPress={() => openActivity("income")}
            destination="Activity"
          />
          <SummaryCard
            icon="expenses"
            iconColor="danger"
            iconBg="dangerSoft"
            label="Expenses"
            amount={dashboardSummary.expenses}
            size={size}
            caption={tiles.expenses?.text}
            captionColor={tiles.expenses?.tone}
            onPress={() => openActivity("expense")}
            destination="Activity"
          />
        </View>

        <View style={styles.gridRow}>
          {/* Insights rather than Goals: this is income minus expenses for the period, and
              the screen that breaks it down is the one with the trend and the savings rate. */}
          <SummaryCard
            icon="wallet"
            iconColor="info"
            iconBg="infoSoft"
            label={tiles.savingsLabel}
            amount={dashboardSummary.savings}
            amountColor={signTone(dashboardSummary.savings, { neutral: "ink" })}
            size={size}
            caption={tiles.savings?.text}
            captionColor={tiles.savings?.tone}
            onPress={() => router.push({ pathname: "/insights", params: { period: targets.insightsPeriod, focus: String(Date.now()) } })}
            destination="Insights"
          />
          <SummaryCard
            icon="investments"
            iconColor="primary"
            iconBg="accentSoft"
            label="Net worth"
            amount={dashboardSummary.netWorth}
            size={size}
            caption={tiles.netWorth?.text}
            captionColor={tiles.netWorth?.tone}
            onPress={accounts.length > 0 ? () => netWorthRef.current?.present() : undefined}
            destination="your net worth"
          />
        </View>
      </View>

      {openTrips.map((trip) => <OpenTripCard key={trip._id} trip={trip} />)}

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

      {/* Absent only while budgets/bills are still loading, since its own empty state (no
          budget set) is a real answer, not a placeholder. */}
      <HomeCard title="Safe to spend" state={safeToSpendState} skeletonHeight={168}>
        <SafeToSpendCard
          hasBudgets={budgets.length > 0}
          safeToSpend={safeToSpend}
          budgetRemaining={budgetTotalsThisMonth.remaining}
          billsOwed={billsOwed}
          dailySafeToSpend={dailySafeToSpend}
          daysLeft={budgetTotalsThisMonth.daysLeft}
          forecast={forecast}
          onPress={budgets.length > 0 ? () => router.push("/budget") : undefined}
          onSetBudget={() => router.push("/budget")}
        />
      </HomeCard>

      {/* The score's card above already says when its request failed: no second box. */}
      <HomeCard
        title="Emergency buffer"
        state={{ ...healthState, error: null }}
        empty={health?.runwayMonths == null}
        skeletonHeight={96}
      >
        {health && <EmergencyFundCard runwayMonths={health.runwayMonths} />}
      </HomeCard>

      <QuickLogRow />

      <HomeCard
        title="Where it went"
        state={insightsState}
        empty={!insights || insights.byCategory.length === 0}
        skeletonHeight={220}
      >
        {insights && (
        <SpendingSnapshotCard
          byCategory={insights.byCategory}
          uncategorised={insights.uncategorised}
          biggestExpense={
            biggest
              ? {
                title: biggest.title,
                amount: biggest.amount,
                daysAgo: calendarDaysBetween(
                  calendarDate(new Date(biggest.occurredAt), appZone()),
                  calendarToday(appZone()),
                ),
              }
              : null
          }
          onPress={() => router.push("/insights")}
        />
        )}
      </HomeCard>

      <HomeCard title="Budgets at a glance" state={budgetsState} empty={budgets.length === 0} skeletonHeight={170}>
        <BudgetsAtAGlanceCard items={budgets} onPress={() => router.push("/budget")} />
      </HomeCard>

      {/* Under the month's figures: those are a reading of thirty days, which doesn't change
          between two glances, while these three rows answer "did that go in?" — the question
          the app is usually opened to check. */}
      <HomeCard
        title="Recent transactions"
        state={transactionsState}
        empty={recentTransactions.length === 0}
        skeletonHeight={230}
      >
        <View style={styles.section}>
          <SectionHeader label="Recent transactions" actionLabel="See all" onAction={() => router.push("/activity")} />
          {recentTransactions.map((transaction) => (
            <TransactionRow
              key={transaction._id}
              transaction={transaction}
              pending={!!transaction.clientId && pendingClientIds.has(transaction.clientId)}
              onPress={() => router.push("/activity")}
            />
          ))}
        </View>
      </HomeCard>

      <HomeCard
        title="This month vs your average"
        state={dashboardInsightsState}
        empty={!daily?.pace}
        skeletonHeight={130}
      >
        {daily?.pace && <PaceCard pace={daily.pace} />}
      </HomeCard>

      <WeekPulseRow
        income={dashboardSummary.weekIncome}
        expense={dashboardSummary.weekExpense}
        savingsPace={savingsPace}
      />

      <HomeCard title="Bills" state={billsState} empty={billsGlanceEmpty(bills)} skeletonHeight={96}>
        <BillsGlanceCard items={bills} onPress={() => router.push("/bills")} />
      </HomeCard>

      <HomeCard
        title="Next 30 days"
        state={cashFlowState}
        empty={!cashFlow || cashFlowGlanceEmpty(cashFlow)}
        skeletonHeight={110}
      >
        {cashFlow && <CashFlowGlanceCard data={cashFlow} onPress={() => router.push("/cash-flow")} />}
      </HomeCard>

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
      </>
      )}
      </ScreenStates>

      <NetWorthSheet ref={netWorthRef} netWorth={dashboardSummary?.netWorth ?? 0} trend={netWorthTrend} />
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
  scope: {
    gap: spacing.sm,
  },
});

export default HomeScreen;
