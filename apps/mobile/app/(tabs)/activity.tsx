import { ActivityIndicator, FlatList, ScrollView, StyleSheet, View } from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { ICategory, ITransaction } from "@save-n-spend/types";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import GradientCard from "@/components/shell/GradientCard";
import TransactionRow from "@/components/rows/TransactionRow";
import TransactionDetailSheet from "@/components/sheets/TransactionDetailSheet";
import { AppText } from "@/components/ui/AppText";
import Search from "@/components/ui/Search";
import Chip from "@/components/ui/Chip";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Fab from "@/components/ui/Fab";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import SkeletonState from "@/components/states/SkeletonState";
import formatMoney from "@/lib/money";
import { useCategories } from "@/lib/categories";
import type { IconName } from "@/lib/icons";
import { useTransactionFeed, useTransactionSummary } from "@/lib/transactions";
import { RANGES, rangeBounds, rangeLabel, type RangeKey } from "@/lib/dateRange";
import { dayGroupLabel, monthGroupLabel } from "@/lib/date";
import { colors, radius, spacing } from "@/theme";

// A flat feed row is either a transaction or a group header injected between days
// (and a heavier month break when the list spans months).
type ListRow =
  | { kind: "month"; key: string; label: string }
  | { kind: "day"; key: string; label: string }
  | { kind: "txn"; key: string; tx: ITransaction };

const DayHeader = ({ label }: { label: string }) => (
  <AppText size="xs" weight="bold" color="inkDim" style={styles.dayHeader}>
    {label}
  </AppText>
);

const MonthDivider = ({ label }: { label: string }) => (
  <View style={styles.monthDivider}>
    <View style={styles.monthLine} />
    <AppText size="xs" weight="black" color="inkDim" style={styles.monthLabel}>
      {label}
    </AppText>
    <View style={styles.monthLine} />
  </View>
);

// Spec month summary: violet-tinted glass · caps range label · 18/800 totals ·
// hairline · net savings in pale green. Driven by the range aggregate, not the page.
const SummaryCard = ({
  label,
  income,
  expense,
  savings,
}: {
  label: string;
  income: number;
  expense: number;
  savings: number;
}) => (
  <GradientCard gradient="brand" style={styles.summary}>
    <AppText color="inkDim" size="xs" weight="semibold" style={styles.summaryLabel}>
      {label}
    </AppText>

    <View style={styles.summaryRow}>
      <View style={styles.summaryCol}>
        <AppText color="inkDim" size="xs">
          Total Income
        </AppText>
        <AppText size="lg" weight="black">
          {formatMoney(income)}
        </AppText>
      </View>

      <View style={[styles.summaryCol, styles.summaryColRight]}>
        <AppText color="inkDim" size="xs">
          Total Expenses
        </AppText>
        <AppText size="lg" weight="black">
          {formatMoney(expense)}
        </AppText>
      </View>
    </View>

    <View style={styles.summaryDivider} />

    <View style={styles.netRow}>
      <AppText color="inkDim" size="xs">
        Net Savings
      </AppText>
      <AppText size="lg" weight="black" style={styles.netAmount}>
        {formatMoney(savings)}
      </AppText>
    </View>
  </GradientCard>
);

const ActivityScreen = () => {
  const router = useRouter();
  const [range, setRange] = useState<RangeKey>("month");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  // Two-tier category filter: a row of top-level parents, and — once one is
  // active — a contextual child row that belongs to it. The open parent is
  // derived from the selection: pick a parent to see its children, pick a child
  // and its parent stays highlighted as the trail.
  const categories = useCategories();
  const parents = useMemo(() => categories.filter((c) => !c.parent), [categories]);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, ICategory[]>();
    for (const c of categories) {
      if (c.parent) map.set(c.parent, [...(map.get(c.parent) ?? []), c]);
    }
    return map;
  }, [categories]);
  const openParentId =
    activeCategory === "all"
      ? null
      : (categories.find((c) => c._id === activeCategory)?.parent ?? activeCategory);
  const openParent = openParentId ? parents.find((p) => p._id === openParentId) : undefined;
  const childRow = openParentId ? (childrenByParent.get(openParentId) ?? []) : [];

  // Search moves server-side, so debounce it — one request per pause, not per key.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const bounds = useMemo(() => rangeBounds(range), [range]);

  const feed = useTransactionFeed({
    startDate: bounds.startDate,
    endDate: bounds.endDate,
    category: activeCategory === "all" ? undefined : activeCategory,
    search: debouncedQuery || undefined,
  });
  const summary = useTransactionSummary({ startDate: bounds.startDate, endDate: bounds.endDate });

  const detailRef = useRef<BottomSheetModal>(null);
  const [activeTransaction, setActiveTransaction] = useState<ITransaction | null>(null);

  // Refresh on focus (e.g. returning from Add Transaction) without re-firing on
  // every filter change — the hooks already reload themselves when filters change.
  const refresh = useRef<() => void>(() => {});
  refresh.current = () => {
    feed.refetch();
    summary.refetch();
  };
  useFocusEffect(useCallback(() => {
    refresh.current();
  }, []));

  const openTransactionDetail = (transaction: ITransaction) => {
    setActiveTransaction(transaction);
    detailRef.current?.present();
  };

  // Group the flat, paginated feed into day sections, injecting a month break
  // when the month rolls over. Month breaks only show for ranges that can span
  // months (Week/Year/All) — they'd be redundant inside a single-month view.
  const showMonths = range !== "day" && range !== "month";
  const listData = useMemo<ListRow[]>(() => {
    const rows: ListRow[] = [];
    let lastDay: string | null = null;
    let lastMonth: string | null = null;
    for (const tx of feed.items) {
      const d = new Date(tx.occurredAt as string);
      const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
      const dayKey = `${monthKey}-${d.getDate()}`;
      if (showMonths && monthKey !== lastMonth) {
        rows.push({ kind: "month", key: `m-${monthKey}`, label: monthGroupLabel(tx.occurredAt as string) });
        lastMonth = monthKey;
      }
      if (dayKey !== lastDay) {
        rows.push({ kind: "day", key: `d-${dayKey}`, label: dayGroupLabel(tx.occurredAt as string) });
        lastDay = dayKey;
      }
      rows.push({ kind: "txn", key: tx._id, tx });
    }
    return rows;
  }, [feed.items, showMonths]);

  return (
    <ScreenScaffold
      title="All Activity"
      scroll={false}
      floating={<Fab onPress={() => router.push("/add-transaction")} />}
    >
      <SegmentedControl segments={RANGES} value={range} onChange={setRange} />

      <Search value={query} onChangeText={setQuery} placeholder="Search transactions" />

      {/* Two-tier category filter, inline. Parents scroll on one row; selecting
          one drops in a child row beneath it (rail + "All <Parent>") so the
          child → parent link reads without a long flat list. */}
      <View style={styles.filterCol}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <Chip label="All" selected={activeCategory === "all"} onPress={() => setActiveCategory("all")} />
          {parents.map((parent) => (
            <Chip
              key={parent._id}
              label={parent.name}
              icon={parent.icon as IconName | undefined}
              selected={activeCategory === parent._id}
              active={openParentId === parent._id && activeCategory !== parent._id}
              onPress={() => setActiveCategory(parent._id)}
            />
          ))}
        </ScrollView>

        {openParent && childRow.length > 0 && (
          <View style={styles.childWrap}>
            <View style={styles.childRail} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.childScroll}
              contentContainerStyle={styles.filterRow}
            >
              <Chip
                label={`All ${openParent.name}`}
                selected={activeCategory === openParent._id}
                onPress={() => setActiveCategory(openParent._id)}
              />
              {childRow.map((child) => (
                <Chip
                  key={child._id}
                  label={child.name}
                  icon={child.icon as IconName | undefined}
                  selected={activeCategory === child._id}
                  onPress={() => setActiveCategory(child._id)}
                />
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {feed.error ? (
        <ErrorState message={feed.error} onRetry={feed.refetch} />
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) =>
            item.kind === "month" ? (
              <MonthDivider label={item.label} />
            ) : item.kind === "day" ? (
              <DayHeader label={item.label} />
            ) : (
              <TransactionRow transaction={item.tx} onPress={() => openTransactionDetail(item.tx)} />
            )
          }
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          onEndReached={feed.loadMore}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            <SummaryCard
              label={rangeLabel(range)}
              income={summary.data?.income ?? 0}
              expense={summary.data?.expenses ?? 0}
              savings={summary.data?.savings ?? 0}
            />
          }
          ListFooterComponent={
            feed.loadingMore ? <ActivityIndicator color={colors.primary} style={styles.footer} /> : null
          }
          ListEmptyComponent={
            feed.loading ? (
              <View style={styles.skeletonCol}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonState key={i} height={64} borderRadius={radius.md} />
                ))}
              </View>
            ) : (
              <EmptyState
                title={debouncedQuery || activeCategory !== "all" ? "No matching transactions" : "No transactions yet"}
                subtitle={
                  debouncedQuery || activeCategory !== "all"
                    ? "Try a different search, category, or range."
                    : "Add your first one with the + button."
                }
              />
            )
          }
          style={styles.list}
        />
      )}

      <TransactionDetailSheet ref={detailRef} transaction={activeTransaction} onDeleted={refresh.current} />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  content: {
    paddingBottom: 96, // clear the floating FAB so the last row stays tappable
    gap: spacing.md, // rhythm between rows and their day/month headers
  },
  dayHeader: {
    letterSpacing: 1.3,
    paddingTop: spacing.xs,
  },
  monthDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  monthLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  monthLabel: {
    letterSpacing: 1.2,
  },
  skeletonCol: {
    gap: spacing.lg, // mirror the real list's row rhythm so the swap doesn't jump
  },
  filterCol: {
    gap: spacing.sm,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingRight: spacing.md, // let the last chip hint at more when it scrolls
  },
  // The child row sits inset behind a short violet rail, tying it to the
  // highlighted parent chip above it.
  childWrap: {
    flexDirection: "row",
    alignItems: "stretch",
    marginLeft: spacing.xs,
  },
  childRail: {
    width: 2,
    borderRadius: 1,
    marginVertical: 4,
    marginRight: spacing.sm,
    backgroundColor: colors.primary,
    opacity: 0.55,
  },
  childScroll: {
    flex: 1,
  },
  footer: {
    paddingVertical: spacing.lg,
  },
  summary: {
    gap: 12, // spec .hero gap × device scale
  },
  summaryLabel: {
    letterSpacing: 1.2, // spec .lbl caps tracking
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryCol: {
    gap: 3,
  },
  summaryColRight: {
    alignItems: "flex-end",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  netRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  netAmount: {
    color: "#8EFFC9", // spec — pale green net savings
  },
});

export default ActivityScreen;
