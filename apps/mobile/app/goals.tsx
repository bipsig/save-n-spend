import { useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { IGoal } from "@save-n-spend/types";
import GoalCard from "@/components/rows/GoalCard";
import GradientCard from "@/components/shell/GradientCard";
import ProgressBar from "@/components/data/ProgressBar";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import EmptyState from "@/components/states/EmptyState";
import NewGoalSheet from "@/components/sheets/NewGoalSheet";
import ContributeSheet from "@/components/sheets/ContributeSheet";
import Icon from "@/components/ui/Icon";
import { AppText } from "@/components/ui/AppText";
import { goals, goalsSummary } from "@/lib/mock";
import formatMoney from "@/lib/money";
import { spacing } from "@/theme";

const Separator = () => <View style={styles.separator} />;

const GoalsSummaryCard = () => {
  const { totalSaved, totalTarget, count } = goalsSummary();
  const percent = totalTarget === 0 ? 0 : Math.round((totalSaved / totalTarget) * 100);

  return (
    <GradientCard gradient="brand" style={styles.summary}>
      <View style={styles.topRow}>
        <View style={styles.savedCol}>
          <AppText color="surface" size="sm" style={styles.muted}>
            Total Saved
          </AppText>
          <AppText color="surface" size="2xl" weight="black">
            {formatMoney(totalSaved)}
          </AppText>
          <AppText color="surface" size="sm" style={styles.muted}>
            {`of ${formatMoney(totalTarget)} target`}
          </AppText>
        </View>
        <View style={styles.countCol}>
          <AppText color="surface" size="2xl" weight="black">
            {count}
          </AppText>
          <AppText color="surface" size="xs" style={styles.muted}>
            {count === 1 ? "goal" : "goals"}
          </AppText>
        </View>
      </View>

      <ProgressBar value={percent} color="surface" trackColor="primaryInk" />

      <AppText color="surface" size="sm" style={styles.muted}>
        {`${percent}% of your goals funded`}
      </AppText>
    </GradientCard>
  );
};

const GoalsScreen = () => {
  const newGoalRef = useRef<BottomSheetModal>(null);
  const contributeRef = useRef<BottomSheetModal>(null);
  const [activeGoal, setActiveGoal] = useState<IGoal | null>(null);

  const openNewGoal = () => newGoalRef.current?.present();
  const openContribute = (goal: IGoal) => {
    setActiveGoal(goal);
    contributeRef.current?.present();
  };

  return (
    <ScreenScaffold
      title="Goals"
      scroll={false}
      headerRight={
        <Pressable onPress={openNewGoal} hitSlop={8}>
          <Icon name="add" container="circle" containerColor="accentSoft" color="primary" />
        </Pressable>
      }
    >
      <FlatList
        data={goals}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <GoalCard goal={item} onPress={() => openContribute(item)} />
        )}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={goals.length > 0 ? <GoalsSummaryCard /> : null}
        ListEmptyComponent={
          <EmptyState
            icon="savings"
            title="No goals yet"
            subtitle="Set a savings target and watch it grow."
            actionLabel="New goal"
            onAction={openNewGoal}
          />
        }
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.list}
      />

      <NewGoalSheet ref={newGoalRef} />
      <ContributeSheet ref={contributeRef} goal={activeGoal} />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing.xl,
  },
  separator: {
    height: spacing.md,
  },
  summary: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  muted: {
    opacity: 0.85,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  savedCol: {
    gap: spacing.xs,
  },
  countCol: {
    alignItems: "flex-end",
  },
});

export default GoalsScreen;
