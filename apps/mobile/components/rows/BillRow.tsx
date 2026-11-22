import type { IBill } from "@save-n-spend/types";
import { StyleSheet, View } from "react-native";
import Card from "../data/Card";
import { AppText } from "../ui/AppText";
import Icon from "../ui/Icon";
import { ArchivedChip } from "../ui/ArchivedMark";
import Badge, { type BadgeTone } from "../ui/Badge";
import PressableScale from "../ui/PressableScale";
import RowActions from "./RowActions";
import { useCategoryById } from "@/lib/categories";
import { useAccountById } from "@/lib/accounts";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { spacing, colors, withAlpha } from "@/theme";
import { holdingLook } from "@/lib/investments";
import { formatDueLabel } from "@/lib/date";
import { isActionable } from "@/lib/bills";
import Money from "../ui/Money";

const STATUS_TONE: Record<IBill["status"], BadgeTone> = { paid: "success", pending: "warning", overdue: "danger" };

type Props = {
  bill: IBill
  onPress?: () => void
  /** Both or neither — the trailing pair only appears on the Bills screen itself. */
  onEdit?: () => void
  onDelete?: () => void
};

const BillRow = ({ bill, onPress, onEdit, onDelete }: Props) => {
  const category = useCategoryById(bill.category);
  // A SIP: funds an investment rather than being spending — shown with the investment look.
  const investment = useAccountById(bill.toInvestment);
  const isSip = !!bill.toInvestment;
  const look = holdingLook(investment);

  // A pending bill already pushed into a future period (paid/skipped this cycle,
  // or created ahead) — shown but not yet actionable.
  const scheduled = bill.status === "pending" && !isActionable(bill);

  const dueLabel = formatDueLabel(bill.dueDate, bill.status, bill.lastPaidAt);
  const meta = bill.pausedAt
    ? "Holding archived · pick another"
    : isSip
    ? [dueLabel, investment?.name ?? "SIP", bill.frequency].filter(Boolean).join(" · ")
    : bill.recurring && bill.frequency ? `${dueLabel} · ${bill.frequency}` : dueLabel;

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
      <ArchivedChip archived={!isSip && !!category?.isArchived} chipSize={44}>
        <Icon
          name={isSip ? look.icon : ((category?.icon ?? "bills") as IconName)}
          size={22}
          container="square"
          containerSize={44}
          gradient={isSip ? look.tint : ((category?.color ?? "accent") as ColorToken)}
        />
      </ArchivedChip>

      {/* The name is capped to a line: the trailing actions take width off this column.
          The status may take two, so "Overdue by 12 days · monthly" is never cut. */}
      <View style={styles.info}>
        <AppText size="md" weight="bold" numberOfLines={1}>
          {bill.name}
        </AppText>
        <AppText size="sm" weight="semibold" color={dueColor} numberOfLines={2}>
          {meta}
        </AppText>
      </View>

      <View style={styles.right}>
        <Money value={bill.amount} size="md" weight="black" />
        {bill.status === "overdue" ? (
          // Keeps its own tick: a nested pressable becomes the touch responder, so the
          // row's would never fire when the pill is what got hit.
          <PressableScale onPress={onPress} scaleTo={0.92} hitSlop={6} style={styles.markPaid} accessibilityLabel={`Mark ${bill.name} paid`}>
            <AppText size="xs" weight="black" color="primary">
              Mark paid
            </AppText>
          </PressableScale>
        ) : bill.pausedAt ? (
          <Badge label="Paused" tone="info" size="sm" />
        ) : scheduled ? (
          <Badge label="Scheduled" tone="info" size="sm" />
        ) : (
          <Badge label={bill.status} tone={STATUS_TONE[bill.status]} size="sm" />
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
    borderColor: withAlpha(colors.danger, 0.35), // spec: overdue rows get a red-tinted border
  },
  scheduled: {
    opacity: 0.6, // handled this cycle — shown but not yet actionable
  },
  info: {
    flex: 1,
    minWidth: 0,
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
    borderColor: withAlpha(colors.seriesViolet, 0.5),
    backgroundColor: withAlpha(colors.brandLight, 0.15),
  },
});

export default BillRow;
