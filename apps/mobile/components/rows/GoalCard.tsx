import type { IGoal } from "@save-n-spend/types";
import { StyleSheet, View } from "react-native";
import ProgressBar from "../data/ProgressBar";
import PressableScale from "../ui/PressableScale";
import RowActions from "./RowActions";
import type { ColorToken } from "@/theme";
import { spacing } from "@/theme";
import Card from "../data/Card";
import { AppText } from "../ui/AppText";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import Icon from "../ui/Icon";
import type { IconName } from "@/lib/icons";
import { formatInstant } from "@/lib/format/date";
import { formatPct } from "@/lib/format/pct";
import { goalPace } from "@/lib/goals";

type Props = {
  goal: IGoal
  onPress?: () => void
  /** Both or neither — the trailing pair only appears on the Goals screen itself. */
  onEdit?: () => void
  onDelete?: () => void
};

// Deadline → "Dec 2026" (absent → "No deadline"). Read in the account zone: a deadline stored
// as the start of 1 September in India is 31 August in UTC.
const deadlineLabel = (iso?: string): string => (iso ? formatInstant(iso, "month") : "No deadline");

// Spec GoalCard: gradient icon chip (goal color, glowing) · name 15/700 ·
// "saved / target" sub · % colored per goal · pace line · tinted gradient bar.
const GoalCard = ({ goal, onPress, onEdit, onDelete }: Props) => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below
  const color = (goal.color ?? "accent") as ColorToken;
  const percent = Math.min((goal.saved / goal.target) * 100, 100);
  const achieved = goal.saved >= goal.target;
  const pace = achieved ? null : goalPace(goal);
  const paceLabel = pace?.projectedDate ? formatInstant(pace.projectedDate, "monthLong") : null;

  return (
    <PressableScale onPress={onPress} disabled={!onPress} scaleTo={0.98}>
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
            <AppText size="md" weight="bold" numberOfLines={1}>
              {goal.name}
            </AppText>
            <AppText size="sm" color="inkDim">
              {`${formatMoney(goal.saved)} / ${formatMoney(goal.target)}`}
            </AppText>
          </View>
          <View style={styles.right}>
            <AppText size="md" weight="black" color={achieved ? "success" : color}>
              {formatPct(percent)}
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

          {onEdit && onDelete && <RowActions label={goal.name} onEdit={onEdit} onDelete={onDelete} />}
        </View>

        <ProgressBar value={percent} color={achieved ? "success" : color} />

        {/* A projection, not a warning — unlike the health score's goal pillar, this
            doesn't need a deadline to say something: "how's it going" is true whether
            or not one was set. Absent when nothing's been saved yet — there's no rate
            to project from, and "any day now" would be a guess dressed up as a number. */}
        {paceLabel && (
          <AppText size="xs" color="inkDim">
            At this pace, done around <AppText size="xs" weight="bold" color="ink">{paceLabel}</AppText>.
          </AppText>
        )}
      </Card>
    </PressableScale>
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
