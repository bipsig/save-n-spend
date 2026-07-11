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

// Deadline → "Dec 2026" pace label (client-derived; absent → "No deadline").
const deadlineLabel = (iso?: string): string =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : "No deadline";

// Spec GoalCard: gradient icon chip (goal color, glowing) · name 15/700 ·
// "saved / target" sub · % colored per goal · pace line · tinted gradient bar.
const GoalCard = ({ goal, onPress }: Props) => {
  const color = (goal.color ?? "accent") as ColorToken;
  const percent = Math.min(Math.round((goal.saved / goal.target) * 100), 100);
  const achieved = goal.saved >= goal.target;

  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <Icon
            name={(goal.icon ?? "savings") as IconName}
            size={22}
            containerSize={44}
            container="square"
            gradient={color}
          />
          <View style={styles.info}>
            <AppText size="md" weight="bold">
              {goal.name}
            </AppText>
            <AppText size="sm" color="inkDim">
              {`${formatMoney(goal.saved)} / ${formatMoney(goal.target)}`}
            </AppText>
          </View>
          <View style={styles.right}>
            <AppText size="md" weight="black" color={achieved ? "success" : color}>
              {`${percent}%`}
            </AppText>
            {achieved ? (
              <AppText size="xs" weight="bold" color="success">
                Achieved ✦
              </AppText>
            ) : (
              <AppText size="xs" weight="semibold" color="inkDim">
                {deadlineLabel(goal.deadline)}
              </AppText>
            )}
          </View>
        </View>

        <ProgressBar value={percent} color={achieved ? "success" : color} />
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
    gap: 14, // spec .rowcard .top gap × device scale
  },
  info: {
    flex: 1,
    gap: 3,
  },
  right: {
    alignItems: "flex-end",
    gap: 3,
  },
});

export default GoalCard;
