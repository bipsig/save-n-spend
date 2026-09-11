import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { ITransaction, InsightsPeriod } from "@save-n-spend/types";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import BackButton from "@/components/shell/BackButton";
import PeekButton from "@/components/shell/PeekButton";
import GradientCard from "@/components/shell/GradientCard";
import Card from "@/components/data/Card";
import AreaChart from "@/components/charts/AreaChart";
import TransactionRow from "@/components/rows/TransactionRow";
import TransactionDetailSheet from "@/components/sheets/TransactionDetailSheet";
import SegmentedControl from "@/components/ui/SegmentedControl";
import PeriodNav from "@/components/ui/PeriodNav";
import Button from "@/components/ui/Button";
import { AppText } from "@/components/ui/AppText";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import SkeletonState from "@/components/states/SkeletonState";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { useCategoryInsights, buildTrend, pctChange } from "@/lib/insights";
import { useTransactionFeed } from "@/lib/transactions";
import { rangeBounds, rangeNavLabel } from "@/lib/dateRange";
import { useAppZone } from "@/lib/zone";
import { colors, radius, spacing } from "@/theme";

const SEGMENTS: { key: InsightsPeriod; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

const isPeriod = (v: unknown): v is InsightsPeriod =>
  v === "week" || v === "month" || v === "year";

const Caps = ({ children }: { children: React.ReactNode }) => (
  <AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>
    {children}
  </AppText>
);

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

  const { data, loading, error, refetch } = useCategoryInsights(id, period, offset);

  // The same window the insights request used, in the shape the feed takes. Derived from
  // the period rather than from `data.periodStart`, so the list and the chart change
  // together instead of the list lagging a fetch behind.
  const bounds = rangeBounds(period, offset);
  const feed = useTransactionFeed({
    startDate: bounds.startDate,
    endDate: bounds.endDate,
    category: id || undefined,
  });

  const detailRef = useRef<BottomSheetModal>(null);
  const [active, setActive] = useState<ITransaction | null>(null);

  const refresh = useRef<() => void>(() => {});
  refresh.current = () => {
    refetch();
    feed.refetch();
  };
  useFocusEffect(useCallback(() => {
    refresh.current();
  }, []));

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
    if (error) return <ErrorState message={error} onRetry={refetch} />;

    if (loading && !data) {
      return (
        <View style={styles.skeletonCol}>
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonState key={i} height={140} borderRadius={radius.lg} />
          ))}
        </View>
      );
    }

    if (!data) return null;

    const trend = buildTrend(data.trend, period);
    const delta = pctChange(data.total, data.previousTotal);
    const childMax = Math.max(...data.children.map((c) => c.total), 1);

    return (
      <>
        <GradientCard gradient="brand" style={styles.stack}>
          <Caps>SPENT HERE</Caps>
          <View style={styles.heroRow}>
            <AppText size="xl" weight="black">
              {formatMoney(data.total)}
            </AppText>
            {data.previousTotal > 0 && (
              <AppText size="sm" weight="bold" color={delta <= 0 ? "success" : "danger"}>
                {`${delta > 0 ? "+" : "−"}${Math.abs(Math.round(delta))}%`}
              </AppText>
            )}
          </View>
          <AppText size="xs" color="inkDim">
            {data.previousTotal > 0
              ? `${formatMoney(data.previousTotal)} the period before · ${Math.round(data.shareOfSpend)}% of all spending`
              : `${Math.round(data.shareOfSpend)}% of all spending this period`}
          </AppText>
          {data.total > 0 ? (
            <AreaChart
              data={trend.values}
              labels={trend.axis}
              tipLabels={trend.tipLabels}
              color="#B0A2FF"
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
            <Caps>WHAT IT BROKE DOWN INTO</Caps>
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
          <Caps>{`${data.txnCount} TRANSACTION${data.txnCount === 1 ? "" : "S"}`}</Caps>
          {feed.error ? (
            <ErrorState message={feed.error} onRetry={feed.refetch} />
          ) : feed.loading ? (
            <View style={styles.skeletonCol}>
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonState key={i} height={72} borderRadius={radius.lg} />
              ))}
            </View>
          ) : feed.items.length === 0 ? (
            <EmptyState
              icon="receipt"
              title="Nothing filed here yet"
              subtitle="Transactions in this category — and any beneath it — show up here."
            />
          ) : (
            <View style={styles.txnList}>
              {feed.items.map((txn) => (
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
      header={
        <View style={styles.head}>
          <BackButton />
          <View style={styles.grow}>
            <AppText size="lg" weight="black" numberOfLines={1}>
              {data?.name ?? passedName}
            </AppText>
            {/* Only on a sub-category, and only then it is worth the line: it says the
                figures below are this child's alone, not its parent's roll-up. */}
            {data?.parentName && (
              <AppText size="xs" color="inkDim">
                {`in ${data.parentName}`}
              </AppText>
            )}
          </View>
          <PeekButton />
        </View>
      }
    >
      <SegmentedControl segments={SEGMENTS} value={period} onChange={changePeriod} />
      <PeriodNav
        label={rangeNavLabel(period, offset)}
        canNext={offset < 0}
        onPrev={() => { setOffset((o) => o - 1); setTip(null); }}
        onNext={() => { setOffset((o) => Math.min(0, o + 1)); setTip(null); }}
      />
      {renderBody()}
      <TransactionDetailSheet ref={detailRef} transaction={active} onDeleted={refresh.current} />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  grow: {
    flex: 1,
  },
  stack: {
    gap: 12,
  },
  caps: {
    letterSpacing: 1.2,
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
