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
import formatMoney from "@/lib/money";

type Props = {
  bill: IBill
  onMarkPaid?: () => void
};

const BillRow = ({ bill, onMarkPaid }: Props) => {
  const category = useCategoryById(bill.category);

  const dueLabel = formatDueLabel(bill.dueDate, bill.status);
  const meta = bill.recurring && bill.frequency ? `${dueLabel} · ${bill.frequency}` : dueLabel;

  // Tone the due label by urgency (value-in-hand derivation): overdue = red,
  // paid = dim, otherwise amber when it's coming up soon.
  const dueColor: ColorToken =
    bill.status === "overdue" ? "danger"
    : bill.status === "paid" ? "inkDim"
    : "warning";

  return (
    <Card style={[styles.container, bill.status === "overdue" && styles.overdue]}>
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
          <Pressable onPress={onMarkPaid} hitSlop={6} style={styles.markPaid}>
            <AppText size="xs" weight="black" color="primary">
              Mark paid
            </AppText>
          </Pressable>
        ) : (
          <Badge label={bill.status} status={bill.status} size="sm" />
        )}
      </View>
    </Card>
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
