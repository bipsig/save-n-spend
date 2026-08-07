import type { IBill } from "@save-n-spend/types";
import { Pressable, StyleSheet, View } from "react-native";
import Card from "../data/Card";
import { AppText } from "../ui/AppText";
import Icon from "../ui/Icon";
import Badge from "../ui/Badge";
import { useCategoryById } from "@/lib/categories";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { spacing } from "@/theme";
import { formatDueLabel } from "@/lib/date";
import { isActionable } from "@/lib/bills";
import formatMoney from "@/lib/money";

type Props = {
  bill: IBill
  onPress?: () => void
};

const BillRow = ({ bill, onPress }: Props) => {
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
    <Pressable onPress={onPress} disabled={!onPress || bill.status === "paid"}>
      <Card style={[styles.container, bill.status === "overdue" && styles.overdue, scheduled && styles.scheduled]}>
      <Icon
        name={(category?.icon ?? "bills") as IconName}
        size={22}
        container="square"
        containerSize={44}
        gradient={(category?.color ?? "accent") as ColorToken}
      />

      <View style={styles.info}>
        <AppText size="md" weight="bold">
          {bill.name}
        </AppText>
        <AppText size="sm" weight="semibold" color={dueColor}>
          {meta}
        </AppText>
      </View>

      <View style={styles.right}>
        <AppText size="md" weight="black">
          {formatMoney(bill.amount)}
        </AppText>
        {bill.status === "overdue" ? (
          <Pressable onPress={onPress} hitSlop={6} style={styles.markPaid}>
            <AppText size="xs" weight="black" color="primary">
              Mark paid
            </AppText>
          </Pressable>
        ) : scheduled ? (
          <Badge label="Scheduled" status="onTrack" size="sm" />
        ) : (
          <Badge label={bill.status} status={bill.status} size="sm" />
        )}
      </View>
      </Card>
    </Pressable>
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
