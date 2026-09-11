import type { IBill } from "@save-n-spend/types";
import { StyleSheet, View } from "react-native";
import Card from "../data/Card";
import { AppText } from "../ui/AppText";
import Icon from "../ui/Icon";
import Badge from "../ui/Badge";
import PressableScale from "../ui/PressableScale";
import RowActions from "./RowActions";
import { useCategoryById } from "@/lib/categories";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { spacing } from "@/theme";
import { formatDueLabel } from "@/lib/date";
import { isActionable } from "@/lib/bills";
import Money from "../ui/Money";

type Props = {
  bill: IBill
  onPress?: () => void
  /** Both or neither — the trailing pair only appears on the Bills screen itself. */
  onEdit?: () => void
  onDelete?: () => void
};

const BillRow = ({ bill, onPress, onEdit, onDelete }: Props) => {
  const category = useCategoryById(bill.category);

  // A pending bill already pushed into a future period (paid/skipped this cycle,
  // or created ahead) — shown but not yet actionable.
  const scheduled = bill.status === "pending" && !isActionable(bill);

  const dueLabel = formatDueLabel(bill.dueDate, bill.status, bill.lastPaidAt);
  const meta = bill.recurring && bill.frequency ? `${dueLabel} · ${bill.frequency}` : dueLabel;

  // Tone the due label by urgency (value-in-hand derivation): overdue = red,
  // paid/scheduled = dim, otherwise amber when it's coming up soon.
  const dueColor: ColorToken =
    bill.status === "overdue" ? "danger"
    : bill.status === "paid" || scheduled ? "inkDim"
    : "warning";

  return (
    // A paid bill has nothing left to do, so it neither dips nor buzzes — the lack of
    // response is the answer.
    <PressableScale onPress={onPress} disabled={!onPress || bill.status === "paid"} scaleTo={0.98}>
      <Card style={[styles.container, bill.status === "overdue" && styles.overdue, scheduled && styles.scheduled]}>
      <Icon
        name={(category?.icon ?? "bills") as IconName}
        size={22}
        container="square"
        containerSize={44}
        gradient={(category?.color ?? "accent") as ColorToken}
      />

      {/* Capped to a line each: the trailing actions take width off this column, and a
          long bill name wrapping would grow the row past its neighbours'. */}
      <View style={styles.info}>
        <AppText size="md" weight="bold" numberOfLines={1}>
          {bill.name}
        </AppText>
        <AppText size="sm" weight="semibold" color={dueColor} numberOfLines={1}>
          {meta}
        </AppText>
      </View>

      <View style={styles.right}>
        <Money value={bill.amount} size="md" weight="black" />
        {bill.status === "overdue" ? (
          // Keeps its own tick: a nested pressable becomes the touch responder, so the
          // row's would never fire when the pill is what got hit.
          <PressableScale onPress={onPress} scaleTo={0.92} hitSlop={6} style={styles.markPaid}>
            <AppText size="xs" weight="black" color="primary">
              Mark paid
            </AppText>
          </PressableScale>
        ) : scheduled ? (
          <Badge label="Scheduled" status="onTrack" size="sm" />
        ) : (
          <Badge label={bill.status} status={bill.status} size="sm" />
        )}
      </View>

      {onEdit && onDelete && <RowActions label={bill.name} onEdit={onEdit} onDelete={onDelete} />}
      </Card>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  overdue: {
    borderColor: "rgba(255,107,116,0.35)", // spec: overdue rows get a red-tinted border
  },
  scheduled: {
    opacity: 0.6, // handled this cycle — shown but not yet actionable
  },
  info: {
    flex: 1,
    gap: spacing.xs,
  },
  right: {
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  markPaid: {
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(163,148,255,0.5)",
    backgroundColor: "rgba(139,123,255,0.15)",
  },
});

export default BillRow;
