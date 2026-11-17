import { useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { ITransaction, InsightsPeriod } from "@save-n-spend/types";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import GradientCard from "@/components/shell/GradientCard";
import Card from "@/components/data/Card";
import AreaChart from "@/components/charts/AreaChart";
import TransactionRow from "@/components/rows/TransactionRow";
import TransactionDetailSheet from "@/components/sheets/TransactionDetailSheet";
import SegmentedControl from "@/components/ui/SegmentedControl";
import PeriodNav from "@/components/ui/PeriodNav";
import Button from "@/components/ui/Button";
import { AppText } from "@/components/ui/AppText";
import Caps from "@/components/ui/Caps";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import ScreenStates from "@/components/states/ScreenStates";
import SkeletonState from "@/components/states/SkeletonState";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { formatPct } from "@/lib/format/pct";
import { count } from "@/lib/format/count";
import { useCategoryInsights, buildTrend, pctChange } from "@/lib/insights";
import { useTransactionFeed } from "@/lib/transactions";
import { usePendingDeletes } from "@/store/pendingDeletes";
import { rangeBounds, rangeNavLabel } from "@/lib/dateRange";
import { relativePeriod } from "@/lib/format/period";
import { useAppZone } from "@/lib/zone";
import { chartValueColor, colors, radius, spacing } from "@/theme";
import { signTone } from "@/lib/signTone";
import { mergeScreenStates } from "@/lib/screenStates";

const SEGMENTS: { key: InsightsPeriod; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

const isPeriod = (v: unknown): v is InsightsPeriod =>
  v === "day" || v === "week" || v === "month" || v === "year";

/**
 * One category's window: what it cost, how that moved, what sits under it, and the
 * transactions behind the figure.
 *
 * Opened from a breakdown row on Insights. The window travels in the params so the screen
 * opens on the month the user was looking at, but it keeps its own period controls — a
 * category is the one place where "and how does this look over the year" is the next question.
 *
 * The transactions come from the ordinary feed endpoint, which already rolls a parent's
 * children in, so the list under the chart is exactly the set the figure was summed from.
 */
const CategoryInsightsScreen = () => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts below
  useAppZone();     // subscribe: changing the zone in Settings re-labels every window
  const params = useLocalSearchParams<{
    id?: string;
    name?: string;
    period?: string;
    offset?: string;
  }>();

  const id = params.id ?? "";
  // The name is passed through so the header has a title before the fetch lands; the
  // response's own name wins once it arrives, since it is the one that can have changed.
  const passedName = params.name ?? "Category";
  const [period, setPeriod] = useState<InsightsPeriod>(isPeriod(params.period) ? params.period : "month");
  const [offset, setOffset] = useState(() => {
    const parsed = Number(params.offset);
    return Number.isFinite(parsed) ? Math.min(0, Math.trunc(parsed)) : 0;
  });
  const [tip, setTip] = useState<number | null>(null);

  const insights = useCategoryInsights(id, period, offset);
  const { data } = insights;

  // The same window the insights request used, in the shape the feed takes. Derived from
  // the period rather than from `data.periodStart`, so the list and the chart change
  // together instead of the list lagging a fetch behind.
  const bounds = rangeBounds(period, offset);
  const feed = useTransactionFeed({
    startDate: bounds.startDate,
    endDate: bounds.endDate,
    category: id ? [id] : undefined,
  });
  // Hidden the instant delete is confirmed — the real DELETE only fires if the undo
  // grace window elapses undisturbed (see store/pendingDeletes.ts).
  const pendingKeys = usePendingDeletes((s) => s.keys);
  const visibleItems = feed.items.filter((t) => !pendingKeys.has(`transaction:${t._id}`));

  const detailRef = useRef<BottomSheetModal>(null);
  const [active, setActive] = useState<ITransaction | null>(null);

  // The figures draw once the insights answer is in; the list below keeps its own section
  // states, so a failed feed read with rows shown is only the refresh strip.
  const merged = mergeScreenStates({ ...insights, hasData: data !== null }, { ...feed, hasData: feed.data !== null });
  const state = {
    ...merged,
    hasData: data !== null,
    error: data !== null ? merged.error : insights.error,
    notFound: !id || insights.errorStatus === 404,
  };

  const changePeriod = (p: InsightsPeriod) => {
    setPeriod(p);
    setOffset(0);
    setTip(null);
  };

  const openDetail = (transaction: ITransaction) => {
    setActive(transaction);
    detailRef.current?.present();
  };

  const renderBody = () => {
    if (!data) return null;

    const trend = buildTrend(data.trend, period);
    const delta = pctChange(data.total, data.previousTotal);
    const childMax = Math.max(...data.children.map((c) => c.total), 1);

    return (
      <>
        <GradientCard gradient="brand" style={styles.stack}>
          <Caps>Spent here</Caps>
          <View style={styles.heroRow}>
            <AppText size="xl" weight="black">
              {formatMoney(data.total)}
            </AppText>
            {data.previousTotal > 0 && (
              <AppText size="sm" weight="bold" color={signTone(delta, { goodWhen: "down" })}>
                {formatPct(delta, { kind: "change" })}
              </AppText>
            )}
          </View>
          <AppText size="xs" color="inkDim">
            {data.previousTotal > 0
              ? `${formatMoney(data.previousTotal)} the period before · ${formatPct(data.shareOfSpend)} of all spending`
              : `${formatPct(data.shareOfSpend)} of all spending this period`}
          </AppText>
          {data.total > 0 ? (
            <AreaChart
              data={trend.values}
              labels={trend.axis}
              tipLabels={trend.tipLabels}
              color={chartValueColor}
              summaryTitle={`${data.name} spending, ${relativePeriod(period, offset)?.toLowerCase() ?? rangeNavLabel(period, offset)}`}
              activeIndex={tip}
              onScrub={setTip}
            />
          ) : (
            <AppText size="sm" color="inkDim">
              Nothing was filed here in this window.
            </AppText>
          )}
        </GradientCard>

        {data.children.length > 0 && (
          <Card style={styles.stack}>
            <Caps header>What it broke down into</Caps>
            <View style={styles.childList}>
              {data.children.map((child) => (
                <View key={child.categoryId} style={styles.childRow}>
                  <View style={styles.childTop}>
                    <AppText size="sm" weight="bold" numberOfLines={1} style={styles.grow}>
                      {child.name}
                    </AppText>
                    <AppText size="sm" weight="bold">
                      {formatMoney(child.total)}
                    </AppText>
                  </View>
                  {/* Scaled against the biggest CHILD, not against the parent's total: the
                      leftover filed straight on the parent has no row here, so bars measured
                      against the total would never fill and look like an error. */}
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${Math.max((child.total / childMax) * 100, 2)}%` }]} />
                  </View>
                </View>
              ))}
            </View>
          </Card>
        )}

        <View style={styles.stack}>
          <Caps header>{count(data.txnCount, "transaction")}</Caps>
          {feed.error && feed.data === null ? (
            <ErrorState message={feed.error} onRetry={feed.refetch} />
          ) : feed.data === null ? (
            <View style={styles.skeletonCol}>
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonState key={i} height={72} borderRadius={radius.lg} />
              ))}
            </View>
          ) : visibleItems.length === 0 ? (
            <EmptyState
              icon="receipt"
              title="Nothing filed here yet"
              subtitle="Transactions in this category — and any beneath it — show up here."
            />
          ) : (
            <View style={styles.txnList}>
              {visibleItems.map((txn) => (
                <TransactionRow key={txn._id} transaction={txn} onPress={() => openDetail(txn)} />
              ))}
              {feed.hasMore && (
                <Button
                  label="Load more"
                  variant="secondary"
                  loading={feed.loadingMore}
                  onPress={feed.loadMore}
                />
              )}
            </View>
          )}
        </View>
      </>
    );
  };

  return (
    <ScreenScaffold
      title={data?.name ?? passedName}
      back
      // Only on a sub-category: it says the figures below are this child's alone, not its
      // parent's roll-up.
      subtitle={data?.parentName ? `in ${data.parentName}` : undefined}
      states={state}
    >
      <SegmentedControl segments={SEGMENTS} value={period} onChange={changePeriod} />
      <PeriodNav
        label={rangeNavLabel(period, offset)}
        canNext={offset < 0}
        onPrev={() => { setOffset((o) => o - 1); setTip(null); }}
        onNext={() => { setOffset((o) => Math.min(0, o + 1)); setTip(null); }}
      />
      {/* A plain Pressable around the content: a tap anywhere that isn't the chart closes its
          tooltip, as on Insights. `accessible={false}` keeps its children reachable. */}
      <Pressable style={styles.body} onPress={() => setTip(null)} accessible={false}>
        <ScreenStates
          state={state}
          thing="category"
          skeleton={
            <View style={styles.skeletonCol}>
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonState key={i} height={140} borderRadius={radius.lg} />
              ))}
            </View>
          }
        >
          {renderBody}
        </ScreenStates>
      </Pressable>
      <TransactionDetailSheet ref={detailRef} transaction={active} />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  body: {
    gap: spacing.lg,
  },
  grow: {
    flex: 1,
  },
  stack: {
    gap: 12,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  childList: {
    gap: 16,
    marginTop: 2,
  },
  childRow: {
    gap: 8,
  },
  childTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  track: {
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.line,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  txnList: {
    gap: spacing.md,
  },
  skeletonCol: {
    gap: spacing.md,
  },
});

export default CategoryInsightsScreen;
