import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import GradientCard from "@/components/shell/GradientCard";
import ProgressBar from "@/components/data/ProgressBar";
import BudgetCategoryRow from "@/components/rows/BudgetCategoryRow";
import { AppText } from "@/components/ui/AppText";
import Button from "@/components/ui/Button";
import PeriodNav from "@/components/ui/PeriodNav";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import SkeletonState from "@/components/states/SkeletonState";
import CategoryPickerSheet from "@/components/sheets/CategoryPickerSheet";
import BudgetLimitSheet from "@/components/sheets/BudgetLimitSheet";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import {
  useBudgets,
  budgetTotals,
  budgetExcludedCategoryIds,
  monthKey,
  monthTitle,
  type BudgetSummary,
} from "@/lib/budgets";
import { rangeNavLabel } from "@/lib/dateRange";
import { useCategories } from "@/lib/categories";
import { radius, spacing } from "@/theme";

type Totals = ReturnType<typeof budgetTotals>;

const BudgetStat = ({ label, stat }: { label: string; stat: string }) => (
  <View>
    <AppText size="xs" color="surface" style={styles.muted}>
      {label}
    </AppText>
    <AppText weight="bold" color="surface">
      {stat}
    </AppText>
  </View>
);

const MonthlyBudgetCard = ({ totals }: { totals: Totals }) => (
  <GradientCard style={styles.hero}>
    <View style={styles.heroTop}>
      <View>
        <AppText size="sm" color="surface" style={styles.muted}>
          Monthly Budget
        </AppText>
        <AppText size="2xl" weight="black" color="surface">
          {formatMoney(totals.total)}
        </AppText>
      </View>
      <View style={styles.spentCol}>
        <AppText size="xs" color="surface" style={styles.muted}>
          Spent
        </AppText>
        <AppText size="lg" weight="black" color="surface">
          {formatMoney(totals.spent)}
        </AppText>
      </View>
    </View>

    <View style={styles.remainingRow}>
      <AppText color="surface" size="sm" style={styles.muted}>
        {`${totals.closed ? "Unspent" : "Remaining"}: ${formatMoney(totals.remaining)}`}
      </AppText>
      <AppText color="surface" size="sm" style={styles.muted}>
        {`${totals.percentUsed}% used`}
      </AppText>
    </View>

    <ProgressBar value={totals.percentUsed} color="surface" trackColor="primaryInk" />

    <View style={styles.divider} />

    {/* A live month paces the days still to come; a closed one has none, so the
        same two slots report what the month actually did. */}
    <View style={styles.statsRow}>
      <BudgetStat label="Status" stat={totals.status} />
      {totals.closed ? (
        <>
          <BudgetStat label="Days" stat={`${totals.daysInMonth} days`} />
          <BudgetStat label="Avg/Day" stat={formatMoney(totals.dailyAverage)} />
        </>
      ) : (
        <>
          <BudgetStat label="Days Left" stat={`${totals.daysLeft} days`} />
          <BudgetStat label="Daily Limit" stat={formatMoney(totals.dailyLimit)} />
        </>
      )}
    </View>
  </GradientCard>
);

const BudgetScreen = () => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below
  // Same windowing convention as Insights and Activity: 0 = this month, negative
  // = past, never positive — there is nothing to show in a month yet to happen.
  const [offset, setOffset] = useState(0);
  const month = monthKey(offset);

  const { items, loading, error, refetch } = useBudgets(month);
  const categories = useCategories();

  const pickerRef = useRef<BottomSheetModal>(null);
  const limitRef = useRef<BottomSheetModal>(null);
  const [active, setActive] = useState<BudgetSummary | null>(null);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);

  // Refresh on focus only. Stepping months already refetches inside `useBudgets`,
  // so depending on `refetch` here would fire a second request for every step.
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  useFocusEffect(useCallback(() => {
    refetchRef.current();
  }, []));

  const openEdit = (summary: BudgetSummary) => {
    setActive(summary);
    setPendingCategory(null);
    limitRef.current?.present();
  };

  // New budget opens the form first; the category is chosen from inside it.
  const openCreate = () => {
    setActive(null);
    setPendingCategory(null);
    limitRef.current?.present();
  };

  // Picker is opened from within the form (which stays mounted behind it), so
  // just record the choice — no need to re-present the form.
  const onPickCategory = (categoryId: string) => {
    setPendingCategory(categoryId);
  };

  const headerRight = (
    <Button label="+ New" pill size="sm" onPress={openCreate} />
  );

  const totals = budgetTotals(items, month);
  const excludedIds = budgetExcludedCategoryIds(items, categories);

  // One tree for every state, so stepping months keeps the navigator in place —
  // and so a refetch can never unmount a sheet that is currently open.
  const body = error ? (
    <ErrorState message={error} onRetry={refetch} />
  ) : loading && items.length === 0 ? (
    <View style={styles.skeletonCol}>
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonState key={i} height={72} borderRadius={radius.lg} />
      ))}
    </View>
  ) : items.length === 0 ? (
    <EmptyState
      icon="insights"
      title={totals.closed ? `Nothing budgeted in ${monthTitle(month)}` : "No budgets yet"}
      subtitle={
        totals.closed
          ? "You can still set a limit for this month to record what it should have been."
          : "Set a monthly limit for a category and track spending against it."
      }
      actionLabel={totals.closed ? "Add a budget" : "Create a budget"}
      onAction={openCreate}
    />
  ) : (
    <>
      <MonthlyBudgetCard totals={totals} />
      {items.map((summary) => (
        <BudgetCategoryRow
          key={summary.budget._id}
          budget={summary.budget}
          spent={summary.spent}
          daysElapsed={totals.daysElapsed}
          daysInMonth={totals.daysInMonth}
          onPress={() => openEdit(summary)}
        />
      ))}
    </>
  );

  return (
    <ScreenScaffold title="Budget" headerRight={headerRight}>
      <PeriodNav
        label={rangeNavLabel("month", offset)}
        canNext={offset < 0}
        onPrev={() => setOffset((o) => o - 1)}
        onNext={() => setOffset((o) => Math.min(0, o + 1))}
      />

      {body}

      <CategoryPickerSheet ref={pickerRef} kind="expense" excludeIds={excludedIds} onPick={onPickCategory} />
      <BudgetLimitSheet
        ref={limitRef}
        month={month}
        summary={active}
        categoryId={pendingCategory}
        onPickCategoryPress={() => pickerRef.current?.present()}
        onChanged={refetch}
      />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  hero: {
    gap: spacing.md,
  },
  muted: {
    opacity: 0.85,
  },
  heroTop: {
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
  skeletonCol: {
    gap: spacing.lg,
  },
});

export default BudgetScreen;
