import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { IGoal } from "@save-n-spend/types";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import GradientCard from "@/components/shell/GradientCard";
import ProgressBar from "@/components/data/ProgressBar";
import GoalCard from "@/components/rows/GoalCard";
import { AppText } from "@/components/ui/AppText";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import SkeletonState from "@/components/states/SkeletonState";
import NewGoalSheet from "@/components/sheets/NewGoalSheet";
import ContributeSheet from "@/components/sheets/ContributeSheet";
import formatMoney from "@/lib/money";
import { useGoals, goalsSummary, sortGoals } from "@/lib/goals";
import { radius, spacing } from "@/theme";

const GoalsScreen = () => {
  const { items, loading, error, refetch } = useGoals();

  const newGoalRef = useRef<BottomSheetModal>(null);
  const contributeRef = useRef<BottomSheetModal>(null);
  const [active, setActive] = useState<IGoal | null>(null);

  useFocusEffect(useCallback(() => {
    refetch();
  }, [refetch]));

  const onPick = (goal: IGoal) => {
    setActive(goal);
    contributeRef.current?.present();
  };

  const headerRight = (
    <Button label="+ New Goal" pill size="sm" onPress={() => newGoalRef.current?.present()} />
  );

  if (error) {
    return (
      <ScreenScaffold title="Goals" headerRight={headerRight}>
        <ErrorState message={error} onRetry={refetch} />
      </ScreenScaffold>
    );
  }

  if (loading && items.length === 0) {
    return (
      <ScreenScaffold title="Goals" headerRight={headerRight}>
        <View style={styles.skeletonCol}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonState key={i} height={92} borderRadius={radius.lg} />
          ))}
        </View>
      </ScreenScaffold>
    );
  }

  const summary = goalsSummary(items);
  const sorted = sortGoals(items);

  return (
    <ScreenScaffold title="Goals" headerRight={headerRight}>
      {items.length === 0 ? (
        <EmptyState
          icon="savings"
          title="Create your first goal"
          subtitle="Set a target and watch your savings fill it up."
          actionLabel="New goal"
          onAction={() => newGoalRef.current?.present()}
        />
      ) : (
        <>
          <GradientCard style={styles.hero}>
            <AppText size="xs" weight="bold" color="surface" style={styles.heroLabel}>
              {`TOTAL SAVED · ${summary.count} ${summary.count === 1 ? "GOAL" : "GOALS"}`}
            </AppText>
            <View style={styles.heroRow}>
              <AppText size="2xl" weight="black" color="surface">
                {formatMoney(summary.totalSaved)}
              </AppText>
              <AppText size="lg" weight="black" color="surface">
                {`${summary.percent}%`}
              </AppText>
            </View>
            <AppText size="sm" color="surface" style={styles.heroSub}>
              {`of ${formatMoney(summary.totalTarget)}`}
            </AppText>
            <ProgressBar value={summary.percent} color="surface" trackColor="primaryInk" />
          </GradientCard>

          {sorted.map((goal) => (
            <GoalCard key={goal._id} goal={goal} onPress={() => onPick(goal)} />
          ))}
        </>
      )}

      <NewGoalSheet ref={newGoalRef} onChanged={refetch} />
      <ContributeSheet ref={contributeRef} goal={active} onChanged={refetch} />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  hero: {
    gap: spacing.sm,
  },
  heroLabel: {
    letterSpacing: 1.3,
    opacity: 0.85,
  },
  heroRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  heroSub: {
    opacity: 0.85,
  },
  skeletonCol: {
    gap: spacing.lg,
  },
});

export default GoalsScreen;
