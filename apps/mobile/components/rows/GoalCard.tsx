import type { IGoal } from "@save-n-spend/types";
import { Pressable, StyleSheet, View } from "react-native";
import ProgressBar from "../data/ProgressBar";
import type { ColorToken } from "@/theme";
import { spacing } from "@/theme";
import Card from "../data/Card";
import { AppText } from "../ui/AppText";
import formatMoney from "@/lib/money";
import Icon from "../ui/Icon";
import type { IconName } from "@/lib/icons";

type Props = {
  goal: IGoal
  onPress?: () => void
};

const GoalCard = ({ goal, onPress }: Props) => {
  const color = (goal.color ?? "accent") as ColorToken;
  const percent = Math.min(Math.round((goal.saved / goal.target) * 100), 100);
  const remaining = Math.max(goal.target - goal.saved, 0);
  const achieved = goal.saved >= goal.target;

  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <Card style={styles.card}>
      <View style={styles.header}>
        <Icon
          name={(goal.icon ?? "savings") as IconName}
          size={22}
          container="square"
          containerColor="glass"
          color={color}
        />
        <View style={styles.info}>
          <AppText size="md" weight="bold">
            {goal.name}
          </AppText>
          <AppText size="sm" color="gray500">
            {`${formatMoney(goal.saved)} of ${formatMoney(goal.target)}`}
          </AppText>
        </View>
        <AppText size="lg" weight="black" color={achieved ? "success" : color}>
          {`${percent}%`}
        </AppText>
      </View>

      <ProgressBar value={percent} color={achieved ? "success" : color} />

      {achieved ? (
        <View style={styles.footer}>
          <Icon name="budgetOk" size={16} color="success" />
          <AppText size="sm" color="success" weight="bold">
            Goal reached
          </AppText>
        </View>
      ) : (
        <AppText size="sm" color="gray500">
          {`${formatMoney(remaining)} to go`}
        </AppText>
      )}
      </Card>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  info: {
    flex: 1,
    gap: spacing.xs,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
});

export default GoalCard;
