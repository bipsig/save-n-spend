import { useRef, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { IGoal } from "@save-n-spend/types";
import GoalCard from "@/components/rows/GoalCard";
import Card from "@/components/data/Card";
import ProgressBar from "@/components/data/ProgressBar";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import EmptyState from "@/components/states/EmptyState";
import NewGoalSheet from "@/components/sheets/NewGoalSheet";
import ContributeSheet from "@/components/sheets/ContributeSheet";
import Button from "@/components/ui/Button";
import { AppText } from "@/components/ui/AppText";
import { goals, goalsSummary } from "@/lib/mock";
import formatMoney from "@/lib/money";
import { spacing } from "@/theme";

const Separator = () => <View style={styles.separator} />;

// Spec hero: glass card · "TOTAL SAVED · N GOALS" caps label ·
// "₹X of ₹Y" + green % on one baseline · green gradient bar.
const GoalsSummaryCard = () => {
  const { totalSaved, totalTarget, count } = goalsSummary();
  const percent = totalTarget === 0 ? 0 : Math.round((totalSaved / totalTarget) * 100);

  return (
    <Card style={styles.summary}>
      <AppText size="xs" weight="semibold" color="inkDim" style={styles.heroLabel}>
        {`TOTAL SAVED · ${count} ${count === 1 ? "GOAL" : "GOALS"}`}
      </AppText>

      <View style={styles.rowSplit}>
        <AppText size="xl" weight="black">
          {formatMoney(totalSaved)}
          <AppText size="sm" weight="semibold" color="inkDim">
            {`  of ${formatMoney(totalTarget)}`}
          </AppText>
        </AppText>
        <AppText size="md" weight="bold" color="success">
          {`${percent}%`}
        </AppText>
      </View>

      <ProgressBar value={percent} color="success" />
    </Card>
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
      headerRight={<Button pill icon="add" label="New Goal" onPress={openNewGoal} />}
    >
      <FlatList
        data={goals}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <GoalCard goal={item} onPress={() => openContribute(item)} />
        )}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={goals.length > 0 ? <GoalsSummaryCard /> : null}
        ListFooterComponent={
          goals.length > 0 ? (
            <AppText size="xs" color="inkDim" style={styles.hint}>
              Tap a goal to add money
            </AppText>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="savings"
            title="Save toward something real"
            subtitle="Set a savings target and watch it fill."
            actionLabel="Create your first goal"
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
    height: spacing.lg,
  },
  summary: {
    gap: 12, // spec .hero gap × device scale
    marginBottom: spacing.lg,
  },
  heroLabel: {
    letterSpacing: 1.2, // spec .lbl caps tracking
  },
  rowSplit: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  hint: {
    textAlign: "center",
    paddingTop: spacing.md,
  },
});

export default GoalsScreen;
