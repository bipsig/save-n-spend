import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { useFocusEffect, useRouter } from "expo-router";
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
import ContributeSheet from "@/components/sheets/ContributeSheet";
import ConfirmSheet from "@/components/sheets/ConfirmSheet";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { useGoals, goalsSummary, sortGoals, deleteGoal } from "@/lib/goals";
import { toast } from "@/store/toast";
import { radius, spacing } from "@/theme";

const GoalsScreen = () => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below
  const router = useRouter();
  const { items, loading, error, refetch } = useGoals();

  const contributeRef = useRef<BottomSheetModal>(null);
  const deleteRef = useRef<BottomSheetModal>(null);
  const [active, setActive] = useState<IGoal | null>(null);
  const [removing, setRemoving] = useState<IGoal | null>(null);

  useFocusEffect(useCallback(() => {
    refetch();
  }, [refetch]));

  const onPick = (goal: IGoal) => {
    setActive(goal);
    contributeRef.current?.present();
  };

  const onDelete = (goal: IGoal) => {
    setRemoving(goal);
    deleteRef.current?.present();
  };

  // Creating a goal is a full modal route, not a sheet — it needs the numpad and
  // the icon/colour grids at full height. Focus-refetch picks up the new goal.
  const openCreate = () => router.push("/add-goal");

  // The same route, which loads the goal from its id — so editing gets the numpad and
  // the grids too, rather than a cut-down sheet that can only rename.
  const openEdit = (goal: IGoal) => router.push({ pathname: "/add-goal", params: { id: goal._id } });

  const headerRight = (
    <Button label="+ New Goal" pill size="sm" onPress={openCreate} />
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
          onAction={openCreate}
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
            // Tweens the gap a deleted card leaves, so the ones below slide up rather
            // than jump into its place.
            <Animated.View key={goal._id} layout={LinearTransition.duration(220)}>
              <GoalCard
                goal={goal}
                onPress={() => onPick(goal)}
                onEdit={() => openEdit(goal)}
                onDelete={() => onDelete(goal)}
              />
            </Animated.View>
          ))}
        </>
      )}

      <ContributeSheet ref={contributeRef} goal={active} onChanged={refetch} />

      <ConfirmSheet
        ref={deleteRef}
        icon="delete"
        title={`Delete ${removing?.name ?? "goal"}?`}
        // Names the figure, because "saved" reads like money held inside the goal. It
        // isn't: contributions were recorded against an account, and only the target
        // and the progress bar built on it go away.
        body={
          removing && removing.saved > 0
            ? `The target goes, and so does the ${formatMoney(removing.saved)} of progress against it. The contributions themselves stay in your transactions — no balance changes.`
            : "The target goes and the card leaves this list. Nothing else changes."
        }
        confirmLabel="Delete goal"
        onConfirm={async () => {
          if (!removing) return;
          await deleteGoal(removing._id);
          refetch();
          toast.success(`${removing.name} deleted`);
        }}
      />
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
