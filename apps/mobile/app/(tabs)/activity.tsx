import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { ITransaction } from "@save-n-spend/types";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import GradientCard from "@/components/shell/GradientCard";
import TransactionRow from "@/components/rows/TransactionRow";
import TransactionDetailSheet from "@/components/sheets/TransactionDetailSheet";
import FailedTransactionSheet from "@/components/sheets/FailedTransactionSheet";
import ActivityFiltersSheet, { TYPES, type TypeKey } from "@/components/sheets/ActivityFiltersSheet";
import ExportSheet from "@/components/sheets/ExportSheet";
import { AppText } from "@/components/ui/AppText";
import Search from "@/components/ui/Search";
import Icon from "@/components/ui/Icon";
import Button from "@/components/ui/Button";
import PressableScale from "@/components/ui/PressableScale";
import SegmentedControl from "@/components/ui/SegmentedControl";
import PeriodNav from "@/components/ui/PeriodNav";
import Fab from "@/components/ui/Fab";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import SkeletonState from "@/components/states/SkeletonState";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { useCategories } from "@/lib/categories";
import { useTransactionFeed, useTransactionSummary } from "@/lib/transactions";
import { RANGES, rangeBounds, rangeLabel, rangeNavLabel, isRangeKey, type RangeKey } from "@/lib/dateRange";
import { dayGroupLabel, monthGroupLabel } from "@/lib/date";
import { dayKey, monthKeyOf, useAppZone } from "@/lib/zone";
import { useOutbox } from "@/store/outbox";
import { usePendingDeletes } from "@/store/pendingDeletes";
import { colors, radius, spacing } from "@/theme";

// A flat feed row is either a transaction or a group header injected between days
// (and a heavier month break when the list spans months).
type ListRow =
  | { kind: "month"; key: string; label: string }
  | { kind: "day"; key: string; label: string }
  | { kind: "txn"; key: string; tx: ITransaction; pending: boolean; failed: boolean };

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
  pending = false,
}: {
  label: string;
  income: number;
  expense: number;
  savings: number;
  /** The totals for THIS label haven't arrived yet. A dash rather than the previous
   *  range's money, which the label no longer describes — and it holds the space the
   *  number will occupy, so nothing reflows when it lands. */
  pending?: boolean;
}) => {
  const money = (paise: number) => (pending ? "—" : formatMoney(paise));

  return (
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
            {money(income)}
          </AppText>
        </View>

        <View style={[styles.summaryCol, styles.summaryColRight]}>
          <AppText color="inkDim" size="xs">
            Total Expenses
          </AppText>
          <AppText size="lg" weight="black">
            {money(expense)}
          </AppText>
        </View>
      </View>

      <View style={styles.summaryDivider} />

      <View style={styles.netRow}>
        <AppText color="inkDim" size="xs">
          Net Savings
        </AppText>
        <AppText size="lg" weight="black" style={styles.netAmount}>
          {money(savings)}
        </AppText>
      </View>
    </GradientCard>
  );
};

const ActivityScreen = () => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below
  const zone = useAppZone(); // subscribe: the zone decides which day each row sits under
  const router = useRouter();
  const [range, setRange] = useState<RangeKey>("month");
  // 0 = current window, -1 = previous, … (never positive — no future).
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeType, setActiveType] = useState<TypeKey>("all");
  // Single-select, like Type — one parent at a time. Sub-categories are multi-select
  // but scoped to whichever parent is active, so switching parents (or clearing back to
  // null) drops whatever sub-category picks belonged to the previous one.
  const [activeCategory, setActiveCategoryRaw] = useState<string | null>(null);
  const [activeSubCategories, setActiveSubCategories] = useState<string[]>([]);
  const setActiveCategory = (id: string | null) => {
    setActiveCategoryRaw(id);
    setActiveSubCategories([]);
  };
  const toggleSubCategory = (id: string) =>
    setActiveSubCategories((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  // Multi-select — an empty array is "no filter".
  const [activeAccounts, setActiveAccounts] = useState<string[]>([]);
  const toggleAccount = (id: string) =>
    setActiveAccounts((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  const filtersRef = useRef<BottomSheetModal>(null);
  // How many of Type/Category/Account are narrowed at all — the trigger button's badge.
  // Counts groups touched, not individual picks, so selecting three accounts still reads
  // as "1" rather than a badge that looks alarming. Search doesn't count toward it: it
  // has its own always-visible field.
  const activeFilterCount =
    (activeType !== "all" ? 1 : 0) + (activeCategory !== null ? 1 : 0) + (activeAccounts.length > 0 ? 1 : 0);

  // Search moves server-side, so debounce it — one request per pause, not per key.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const bounds = useMemo(() => rangeBounds(range, offset), [range, offset]);

  // Switching range type re-anchors to the current window; "all" has no periods
  // to page through.
  const changeRange = (r: RangeKey) => {
    setRange(r);
    setOffset(0);
  };
  const goPrev = () => setOffset((o) => o - 1);
  const goNext = () => setOffset((o) => Math.min(0, o + 1));

  // The category selection goes back to empty with it: the categories on offer are
  // about to be a different set, and a pick that's left the kind it was made in cannot
  // be unmade.
  const changeType = (t: TypeKey) => {
    setActiveType(t);
    setActiveCategory(null);
  };

  // Opened from a dashboard tile ("Income" / "Expenses"), which names the kind and the month
  // its figure was summed over. `focus` is a nonce: without it, tapping the same tile after
  // changing the filter here by hand would arrive with identical params and change nothing.
  const params = useLocalSearchParams<{ type?: string; range?: string; focus?: string }>();
  useEffect(() => {
    if (params.type && TYPES.some((t) => t.key === params.type)) {
      setActiveType(params.type as TypeKey);
      setActiveCategory(null);
    }
    if (isRangeKey(params.range)) {
      setRange(params.range);
      setOffset(0);
    }
  }, [params.type, params.range, params.focus]);

  // Specific sub-categories narrow further than the parent alone; picking none just
  // means "the whole parent" — the server already expands a parent id to its children.
  const categoryFilter = activeSubCategories.length > 0
    ? activeSubCategories
    : activeCategory ? [activeCategory] : undefined;

  // A queued (offline) transaction is always tagged with a specific leaf category, never
  // a bare parent — so matching it against a parent-only filter needs the same "parent
  // implies its children" expansion the server does for the real feed.
  const categories = useCategories();
  const matchesCategoryFilter = (categoryId: string | null | undefined): boolean => {
    if (!categoryFilter) return true;
    if (!categoryId) return false;
    if (categoryFilter.includes(categoryId)) return true;
    const parent = categories.find((c) => c._id === categoryId)?.parent;
    return !!parent && categoryFilter.includes(parent);
  };

  const feed = useTransactionFeed({
    startDate: bounds.startDate,
    endDate: bounds.endDate,
    category: categoryFilter,
    account: activeAccounts,
    type: activeType === "all" ? undefined : activeType,
    search: debouncedQuery || undefined,
  });
  const summary = useTransactionSummary({ startDate: bounds.startDate, endDate: bounds.endDate });

  const detailRef = useRef<BottomSheetModal>(null);
  const exportRef = useRef<BottomSheetModal>(null);
  const failedRef = useRef<BottomSheetModal>(null);
  const [activeTransaction, setActiveTransaction] = useState<ITransaction | null>(null);
  const [activeFailed, setActiveFailed] = useState<{ clientId: string; error: string | null } | null>(null);

  // Queued transactions waiting on this phone — merged into the rows below rather than
  // shown separately, so a quiet Tuesday with one offline entry still reads as one list.
  const pendingItems = useOutbox((s) => s.items);
  const lastDrainedAt = useOutbox((s) => s.lastDrainedAt);
  const pendingByClientId = useMemo(
    () => new Map(pendingItems.map((item) => [item.clientId, item])),
    [pendingItems]
  );
  // Once a queued item's real transaction has landed from the server, its clientId shows
  // up here too — dropping the synthetic row at that point is what stops a drain from
  // showing the same transaction twice.
  const syncedClientIds = useMemo(
    () => new Set(feed.items.map((tx) => tx.clientId).filter((cid): cid is string => !!cid)),
    [feed.items]
  );
  const pendingTransactions = useMemo(() => pendingItems
    .filter((item) => !syncedClientIds.has(item.clientId))
    // Same criteria the server-side feed already applies, so a queued transaction only
    // shows up where its synced twin eventually will.
    .filter((item) => {
      const p = item.payload;
      if (activeType !== "all" && p.type !== activeType) return false;
      if (!matchesCategoryFilter(p.category as string | undefined)) return false;
      // A transfer's destination is `toAccount`, not `account` — same both-sides match
      // as the server's own filter (transactionController.ts's filterTransactions).
      if (
        activeAccounts.length > 0
        && !activeAccounts.includes(p.account as string)
        && !activeAccounts.includes(p.toAccount as string)
      ) return false;
      const occurredAt = p.occurredAt as string | undefined;
      if (occurredAt) {
        const day = dayKey(new Date(occurredAt), zone);
        if (bounds.startDate && day < bounds.startDate) return false;
        if (bounds.endDate && day > bounds.endDate) return false;
      }
      if (debouncedQuery) {
        const title = ((p.title as string | undefined) ?? "").toLowerCase();
        if (!title.includes(debouncedQuery.toLowerCase())) return false;
      }
      return true;
    })
    .map((item) => ({ ...item.payload, _id: item.clientId, clientId: item.clientId }) as unknown as ITransaction),
  [pendingItems, syncedClientIds, activeType, activeCategory, activeSubCategories, categories, activeAccounts, bounds, zone, debouncedQuery]);

  // Hidden the instant delete is confirmed — the real DELETE only fires if the undo
  // grace window elapses undisturbed (see store/pendingDeletes.ts). `syncedClientIds`
  // above deliberately still reads the unfiltered `feed.items` — outbox dedup and delete
  // state are unrelated, so a deleted-but-not-yet-committed row still counts as "synced".
  const pendingDeleteKeys = usePendingDeletes((s) => s.keys);
  const mergedTransactions = useMemo(() => {
    const visibleFeedItems = feed.items.filter((t) => !pendingDeleteKeys.has(`transaction:${t._id}`));
    return pendingTransactions.length === 0
      ? visibleFeedItems
      : [...pendingTransactions, ...visibleFeedItems].sort(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
      );
  }, [feed.items, pendingTransactions, pendingDeleteKeys]);

  // Refresh on focus (e.g. returning from Add Transaction). The hooks already reload
  // themselves when filters change.
  const refresh = useRef<() => void>(() => {});
  refresh.current = () => {
    feed.refetch();
    summary.refetch();
  };
  useFocusEffect(useCallback(() => {
    refresh.current();
  }, []));

  // A drain can land while this screen is already on-screen (reconnecting mid-browse),
  // not only on the way back to it — the focus effect above wouldn't otherwise catch it.
  useEffect(() => {
    if (lastDrainedAt) refresh.current();
  }, [lastDrainedAt]);

  // Pull-to-refresh — its own state rather than `feed.loading`, which is also true for
  // every ordinary filter change and would pop the pull spinner for those too.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([feed.refetch(), summary.refetch()]);
    }
    finally {
      setRefreshing(false);
    }
  };

  const openTransactionDetail = (transaction: ITransaction) => {
    setActiveTransaction(transaction);
    detailRef.current?.present();
  };

  const openFailedSheet = (clientId: string, error: string | null) => {
    setActiveFailed({ clientId, error });
    failedRef.current?.present();
  };

  // Whether an empty list means "nothing here" or "nothing matching what you asked for".
  const narrowed = !!debouncedQuery || activeCategory !== null || activeAccounts.length > 0 || activeType !== "all";

  // Day sections, with a month break when the month rolls over. Only for ranges that can
  // span months (Week/Year/All) — redundant inside a single-month view.
  const showMonths = range !== "day" && range !== "month";
  const listData = useMemo<ListRow[]>(() => {
    const rows: ListRow[] = [];
    let lastDay: string | null = null;
    let lastMonth: string | null = null;
    for (const tx of mergedTransactions) {
      // Cut in the user's zone — what the labels print and what the server counted the
      // day in. Keyed off the DEVICE's day, a 1am purchase abroad opens a second "Today".
      const instant = new Date(tx.occurredAt as string);
      const month = monthKeyOf(instant, zone);
      const day = dayKey(instant, zone);
      if (showMonths && month !== lastMonth) {
        rows.push({ kind: "month", key: `m-${month}`, label: monthGroupLabel(tx.occurredAt as string) });
        lastMonth = month;
      }
      if (day !== lastDay) {
        rows.push({ kind: "day", key: `d-${day}`, label: dayGroupLabel(tx.occurredAt as string) });
        lastDay = day;
      }
      const outboxEntry = tx.clientId ? pendingByClientId.get(tx.clientId) : undefined;
      rows.push({
        kind: "txn",
        key: tx._id,
        tx,
        pending: outboxEntry?.status === "queued",
        failed: outboxEntry?.status === "failed",
      });
    }
    return rows;
  }, [mergedTransactions, showMonths, zone, pendingByClientId]);

  return (
    <ScreenScaffold
      title="All Activity"
      scroll={false}
      headerRight={
        <Button
          label="Export"
          icon="download"
          pill
          size="sm"
          variant="secondary"
          onPress={() => exportRef.current?.present()}
        />
      }
      floating={<Fab onPress={() => router.push("/add-transaction")} />}
    >
      <SegmentedControl segments={RANGES} value={range} onChange={changeRange} />

      {range !== "all" && (
        <PeriodNav
          label={rangeNavLabel(range, offset)}
          canNext={offset < 0}
          onPrev={goPrev}
          onNext={goNext}
        />
      )}

      {/* Type/Category/Account used to be three stacked rows here, permanently on
          screen whether or not anything was actually narrowed. They now live in one
          sheet reached by this button — same three choices, same live filtering the
          instant a chip is tapped, just not taking up space when nothing's set. */}
      <View style={styles.searchRow}>
        <View style={styles.searchFlex}>
          <Search value={query} onChangeText={setQuery} placeholder="Search transactions" />
        </View>
        <PressableScale
          style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
          onPress={() => filtersRef.current?.present()}
          scaleTo={0.94}
        >
          <Icon name="filter" size={19} color={activeFilterCount > 0 ? "primary" : "inkDim"} />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <AppText size="xs" weight="black" color="surface" style={styles.filterBadgeText}>
                {activeFilterCount}
              </AppText>
            </View>
          )}
        </PressableScale>
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
              <TransactionRow
                transaction={item.tx}
                pending={item.pending}
                failed={item.failed}
                onPress={
                  item.failed
                    ? () => openFailedSheet(item.tx.clientId!, pendingByClientId.get(item.tx.clientId!)?.error ?? null)
                    // A merely-pending row has nothing to fix yet — nothing to tap into.
                    : item.pending
                      ? undefined
                      : () => openTransactionDetail(item.tx)
                }
              />
            )
          }
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          onEndReached={feed.loadMore}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
              progressBackgroundColor="#1B1730"
            />
          }
          ListHeaderComponent={
            <SummaryCard
              label={rangeLabel(range, offset)}
              income={summary.data?.income ?? 0}
              expense={summary.data?.expenses ?? 0}
              savings={summary.data?.savings ?? 0}
              pending={!summary.data}
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
                title={narrowed ? "No matching transactions" : "No transactions yet"}
                subtitle={
                  narrowed
                    // Names the actual term when there is one to name — "try a different
                    // search" reads as generic advice when a category/type filter alone
                    // is what's narrowing the list, so that case keeps the general line.
                    ? debouncedQuery
                      ? `No matches for "${debouncedQuery}".`
                      : "Try a different filter or range."
                    : "Record what you spend and earn, and this becomes your full history."
                }
                // Only the never-recorded-anything case gets a button — the fix for an
                // empty search is a different query, not a new entry.
                {...(!narrowed && {
                  actionLabel: "Add transaction",
                  onAction: () => router.push("/add-transaction"),
                })}
              />
            )
          }
          style={styles.list}
        />
      )}

      <TransactionDetailSheet ref={detailRef} transaction={activeTransaction} onCommitted={refresh.current} />
      <FailedTransactionSheet
        ref={failedRef}
        error={activeFailed?.error ?? null}
        onRetry={() => activeFailed && useOutbox.getState().retry(activeFailed.clientId)}
        onEdit={() => activeFailed && router.push({ pathname: "/add-transaction", params: { draftFrom: activeFailed.clientId } })}
        onDiscard={() => activeFailed && useOutbox.getState().discard(activeFailed.clientId)}
      />
      <ExportSheet ref={exportRef} defaultRange={range} defaultOffset={offset} />
      <ActivityFiltersSheet
        ref={filtersRef}
        activeType={activeType}
        onChangeType={changeType}
        activeCategory={activeCategory}
        onChangeCategory={setActiveCategory}
        activeSubCategories={activeSubCategories}
        onToggleSubCategory={toggleSubCategory}
        activeAccounts={activeAccounts}
        onToggleAccount={toggleAccount}
        onClearAccounts={() => setActiveAccounts([])}
        resultCount={feed.totalDocs}
      />
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
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  searchFlex: {
    flex: 1,
  },
  // Reads as a live control once something's set — same violet-tinted border/fill
  // `Chip`'s own selected state uses — rather than a plain settings gear.
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  filterBtnActive: {
    borderColor: "rgba(163,148,255,0.45)",
    backgroundColor: "rgba(139,123,255,0.14)",
  },
  filterBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  filterBadgeText: {
    lineHeight: 12,
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
