import { forwardRef } from "react";
import { StyleSheet, View } from "react-native";
import type { IBill } from "@save-n-spend/types";
import { BottomSheetModal, useBottomSheetModal } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { AppText } from "@/components/ui/AppText";
import { useCategoryById } from "@/lib/categories";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { spacing } from "@/theme";
import formatMoney from "@/lib/money";
import { formatDueLabel, rollDueDate, formatFullDate } from "@/lib/date";
import { accounts, defaultAccountId } from "@/lib/mock";

type Props = {
  bill: IBill | null;
  onPaid: (billId: string) => void;
};

const payFrom = accounts.find((a) => a._id === defaultAccountId);

// One effect line in the "WHAT HAPPENS" preview.
const Effect = ({ icon, color, children }: { icon: IconName; color: ColorToken; children: React.ReactNode }) => (
  <View style={styles.fxRow}>
    <Icon name={icon} size={18} color={color} />
    <AppText size="sm" color="inkSecondary" style={styles.fxText}>
      {children}
    </AppText>
  </View>
);

const MarkPaidSheet = forwardRef<BottomSheetModal, Props>(({ bill, onPaid }, ref) => {
  const { dismiss } = useBottomSheetModal();

  const category = useCategoryById(bill?.category ?? null);

  const confirm = () => {
    if (!bill) return;
    // The three preview lines ARE the POST /bills/:id/pay contract. Mock: log the
    // would-be spawned transaction + rolled date, then flip local status.
    const spawnedTxn = {
      type: "expense" as const,
      amount: bill.amount,
      category: bill.category,
      account: defaultAccountId,
      title: bill.name,
      occurredAt: new Date().toISOString(),
    };
    console.log("mark paid → spawn txn", spawnedTxn);
    if (bill.recurring && bill.frequency) {
      console.log("mark paid → roll dueDate", rollDueDate(bill.dueDate, bill.frequency));
    }
    onPaid(bill._id);
    dismiss();
  };

  return (
    <AppSheet ref={ref}>
      {bill && (
        <>
          <View style={styles.identity}>
            <Icon
              name={(category?.icon ?? "bills") as IconName}
              size={30}
              container="square"
              containerSize={64}
              containerRadius={21}
              gradient={(category?.color ?? "accent") as ColorToken}
            />
            <AppText size="md" weight="black">
              {bill.name}
            </AppText>
            <AppText size="xs" color="inkDim">
              {`${formatMoney(bill.amount)} · ${formatDueLabel(bill.dueDate, bill.status).toLowerCase()}`}
            </AppText>
          </View>

          <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
            WHAT HAPPENS
          </AppText>

          <View style={styles.effects}>
            <Effect icon="budgetOk" color="success">
              Logs a <AppText size="sm" weight="bold" color="ink">{formatMoney(bill.amount)}</AppText> expense in {category?.name ?? "Uncategorized"}
            </Effect>
            <Effect icon="budgetOk" color="success">
              This bill flips to <AppText size="sm" weight="bold" color="ink">PAID</AppText> for this cycle
            </Effect>
            {bill.recurring && bill.frequency && (
              <Effect icon="clock" color="info">
                {bill.frequency === "monthly" ? "Monthly" : "Yearly"} — next due rolls to{" "}
                <AppText size="sm" weight="bold" color="ink">
                  {formatFullDate(rollDueDate(bill.dueDate, bill.frequency))}
                </AppText>
              </Effect>
            )}
          </View>

          {/* PAY FROM — defaults to the default account; the account sub-picker
              (chevron) lands with the sub-picker milestone. */}
          <View style={styles.selRow}>
            <Icon name="wallet" size={18} color="inkDim" />
            <View style={styles.selText}>
              <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
                PAY FROM
              </AppText>
              <AppText size="sm" weight="semibold">
                {payFrom?.name ?? "Default account"}
              </AppText>
            </View>
            <Icon name="chevronRight" size={20} color="inkDim" />
          </View>

          <Button label="Mark as Paid" variant="success" onPress={confirm} />
          <Button label="Cancel" variant="ghost" onPress={() => dismiss()} />
        </>
      )}
    </AppSheet>
  );
});

MarkPaidSheet.displayName = "MarkPaidSheet";

const styles = StyleSheet.create({
  identity: {
    alignItems: "center",
    gap: spacing.sm,
  },
  label: {
    letterSpacing: 1.3,
  },
  effects: {
    gap: spacing.md,
  },
  fxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  fxText: {
    flex: 1,
    lineHeight: 20,
  },
  selRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  selText: {
    flex: 1,
    gap: 2,
  },
});

export default MarkPaidSheet;
