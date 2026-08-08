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
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import SkeletonState from "@/components/states/SkeletonState";
import CategoryPickerSheet from "@/components/sheets/CategoryPickerSheet";
import BudgetLimitSheet from "@/components/sheets/BudgetLimitSheet";
import formatMoney from "@/lib/money";
import {
  useBudgets,
  budgetTotals,
  budgetExcludedCategoryIds,
  currentMonth,
  type BudgetSummary,
} from "@/lib/budgets";
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
        {`Remaining: ${formatMoney(totals.remaining)}`}
      </AppText>
      <AppText color="surface" size="sm" style={styles.muted}>
        {`${totals.percentUsed}% used`}
      </AppText>
    </View>

    <ProgressBar value={totals.percentUsed} color="surface" trackColor="primaryInk" />

    <View style={styles.divider} />

    <View style={styles.statsRow}>
      <BudgetStat label="Status" stat={totals.status} />
      <BudgetStat label="Days Left" stat={`${totals.daysLeft} days`} />
      <BudgetStat label="Daily Limit" stat={formatMoney(totals.dailyLimit)} />
    </View>
  </GradientCard>
);

const BudgetScreen = () => {
  const month = currentMonth();
  const { items, loading, error, refetch } = useBudgets(month);
  const categories = useCategories();

  const pickerRef = useRef<BottomSheetModal>(null);
  const limitRef = useRef<BottomSheetModal>(null);
  const [active, setActive] = useState<BudgetSummary | null>(null);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    refetch();
  }, [refetch]));

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

  if (error) {
    return (
      <ScreenScaffold title="Budget" headerRight={headerRight}>
        <ErrorState message={error} onRetry={refetch} />
      </ScreenScaffold>
    );
  }

  if (loading && items.length === 0) {
    return (
      <ScreenScaffold title="Budget" headerRight={headerRight}>
        <View style={styles.skeletonCol}>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonState key={i} height={72} borderRadius={radius.lg} />
          ))}
        </View>
      </ScreenScaffold>
    );
  }

  const totals = budgetTotals(items);
  const excludedIds = budgetExcludedCategoryIds(items, categories);

  return (
    <ScreenScaffold title="Budget" headerRight={headerRight}>
      {items.length === 0 ? (
        <EmptyState
          icon="insights"
          title="No budgets yet"
          subtitle="Set a monthly limit for a category and track spending against it."
          actionLabel="Create a budget"
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
              onPress={() => openEdit(summary)}
            />
          ))}
        </>
      )}

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
