import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import GradientCard from "@/components/shell/GradientCard";
import ProgressBar from "@/components/data/ProgressBar";
import BudgetCategoryRow from "@/components/rows/BudgetCategoryRow";
import { AppText } from "@/components/ui/AppText";
import Caps from "@/components/ui/Caps";
import { StatRow, type StatTileProps } from "@/components/ui/StatTile";
import PeriodNav from "@/components/ui/PeriodNav";
import EmptyState from "@/components/states/EmptyState";
import ScreenStates from "@/components/states/ScreenStates";
import SkeletonState from "@/components/states/SkeletonState";
import CategoryPickerSheet from "@/components/sheets/CategoryPickerSheet";
import BudgetLimitSheet from "@/components/sheets/BudgetLimitSheet";
import formatMoney, { formatMoneyExact, formatRemaining, usePrivacyMask } from "@/lib/money";
import { formatPct } from "@/lib/format/pct";
import { count } from "@/lib/format/count";
import { screenTitles } from "@/data/menu";
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
import { useVisible } from "@/lib/undo";
import { radius, spacing } from "@/theme";

type Totals = ReturnType<typeof budgetTotals>;

const exact = (p: number) => formatMoneyExact(p);

const MonthlyBudgetCard = ({ totals }: { totals: Totals }) => {
  // A live month paces the days still to come; a closed one has none, so the same two slots
  // report what the month actually did.
  const stats: StatTileProps[] = [
    { label: "Status", text: totals.status },
    ...(totals.closed
      ? [
          { label: "Days", text: count(totals.daysInMonth, "day") },
          { label: "A day", amount: totals.dailyAverage, format: exact },
        ]
      : [
          { label: "Days left", text: count(totals.daysLeft, "day") },
          { label: "Daily limit", amount: totals.dailyLimit, format: exact },
        ]),
  ];
  // D11: "₹500.00 over", never a negative "remaining". A closed month that came in under
  // keeps its own word.
  const remaining = totals.closed && totals.remaining >= 0
    ? `${formatMoney(totals.remaining)} unspent`
    : formatRemaining(totals.remaining);

  return (
    <GradientCard style={styles.hero}>
      <View style={styles.heroTop}>
        <View>
          <Caps color="onGradientDim">Monthly budget</Caps>
          <AppText size="2xl" weight="black" color="surface">
            {formatMoney(totals.total)}
          </AppText>
        </View>
        <View style={styles.spentCol}>
          <Caps color="onGradientDim">Spent</Caps>
          <AppText size="lg" weight="black" color="surface">
            {formatMoney(totals.spent)}
          </AppText>
        </View>
      </View>

      <View style={styles.remainingRow}>
        <AppText color="surface" size="sm" style={styles.muted}>
          {remaining}
        </AppText>
        <AppText color="surface" size="sm" style={styles.muted}>
          {`${formatPct(totals.percentUsed)} used`}
        </AppText>
      </View>

      <ProgressBar value={totals.percentUsed} color="surface" trackColor="primaryInk" />

      <View style={styles.divider} />

      <StatRow surface="gradient" gap={spacing.lg} items={stats} />
    </GradientCard>
  );
};

const BudgetScreen = () => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below
  // Same windowing convention as Insights and Activity: 0 = this month, negative
  // = past, never positive — there is nothing to show in a month yet to happen.
  const [offset, setOffset] = useState(0);
  const month = monthKey(offset);

  const budgets = useBudgets(month);
  const { refetch } = budgets;
  const items = useVisible("budget", budgets.items, (b) => b.budget._id);
  const state = { ...budgets, hasData: budgets.data !== null };
  const categories = useCategories();

  const pickerRef = useRef<BottomSheetModal>(null);
  const limitRef = useRef<BottomSheetModal>(null);
  const [active, setActive] = useState<BudgetSummary | null>(null);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);

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

  const totals = budgetTotals(items, month);
  const excludedIds = budgetExcludedCategoryIds(items, categories);

  const body = items.length === 0 ? (
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
    <ScreenScaffold
      title={screenTitles.budget}
      back
      actions={[{ kind: "new", label: "New budget", onPress: openCreate }]}
      states={state}
    >
      {/* Outside the states, so stepping months keeps the navigator in place. */}
      <PeriodNav
        label={rangeNavLabel("month", offset)}
        canNext={offset < 0}
        onPrev={() => setOffset((o) => o - 1)}
        onNext={() => setOffset((o) => Math.min(0, o + 1))}
      />

      <ScreenStates
        state={state}
        skeleton={
          <View style={styles.skeletonCol}>
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonState key={i} height={72} borderRadius={radius.lg} />
            ))}
          </View>
        }
      >
        {body}
      </ScreenStates>

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
  skeletonCol: {
    gap: spacing.lg,
  },
});

export default BudgetScreen;
