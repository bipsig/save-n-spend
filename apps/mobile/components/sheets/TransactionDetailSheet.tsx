import type { ITransaction } from "@save-n-spend/types";
import AppSheet from "@/components/sheets/AppSheet";
import formatMoney from "@/lib/money";
import { useAccountById } from "@/lib/accounts";
import { forwardRef, useState } from "react";
import { BottomSheetModal, useBottomSheetModal } from "@gorhom/bottom-sheet";
import { useCategoryById } from "@/lib/categories";
import Icon from "../ui/Icon";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { colors, spacing } from "@/theme";
import { StyleSheet, View } from "react-native";
import { AppText } from "../ui/AppText";
import Button from "../ui/Button";
import { formatFullDate } from "@/lib/date";
import { categoryBg } from "@/lib/categories";
import { del } from "@/lib/api";
import { useRouter } from "expo-router";

// Spec .selrow — boxed glass strip: leading icon · (caps label over bold value) · optional ›
const SelRow = ({
  icon,
  label,
  value,
  valueColor = "ink",
  chevron = false,
}: {
  icon: IconName
  label: string
  value: string
  valueColor?: ColorToken
  chevron?: boolean
}) => (
  <View style={styles.selRow}>
    <Icon name={icon} size={19} color="inkDim" />
    <View style={styles.selCol}>
      <AppText color="inkDim" weight="semibold" style={styles.selLabel}>
        {label}
      </AppText>
      <AppText size="sm" weight="bold" color={valueColor}>
        {value}
      </AppText>
    </View>
    {chevron && (
      <AppText size="sm" weight="bold" color="inkDim">
        ›
      </AppText>
    )}
  </View>
);

type Props = {
  transaction: ITransaction | null,
  onDeleted?: () => void
}

const TransactionDetailSheet = forwardRef<BottomSheetModal, Props>(({
  transaction,
  onDeleted
}, ref) => {
  const { dismiss } = useBottomSheetModal();

  const router = useRouter();

  const account = useAccountById(transaction?.account);
  const category = useCategoryById(transaction?.category);

  const [confirmView, setConfirmView] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const amount = !transaction ? 0 : transaction?.type === "expense" ? -transaction.amount : transaction?.amount;

  const handleEdit = () => {
    dismiss();
    router.push({
      pathname: "/add-transaction",
      params: {
        id: transaction?._id
      }
    });
  }

  const handleDelete = async () => {
    if (!transaction) {
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    try {
      await del(`/transactions/${transaction?._id}`);
      onDeleted?.();
      dismiss();
    }
    catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Error deleting the transaction");
    }
    finally {
      setDeleting(false);
    }
  }

  return (
    <AppSheet ref={ref} onDismiss={() => { setConfirmView(false); setDeleteError (null); }}>
      {transaction && (
        !confirmView ? (
          <>
            {/* Spec §08 .centerid — chip · title · spaced-sign amount · tinted badge */}
            <View style={styles.identity}>
              <Icon
                name={(category?.icon ?? "activity") as IconName}
                size={30}
                containerSize={64}
                containerRadius={21}
                container="square"
                gradient={(category?.color ?? "accent") as ColorToken}
              />
              <AppText size="md" weight="black">
                {transaction.title}
              </AppText>
              <AppText size="xl" weight="black" color={amount < 0 ? "danger" : "success"}>
                {`${amount < 0 ? "− " : "+ "}${formatMoney(Math.abs(amount))}`}
              </AppText>
              <View
                style={[styles.badge, { backgroundColor: colors[categoryBg(category?.color)] }]}
              >
                <AppText
                  weight="black"
                  color={(category?.color ?? "accent") as ColorToken}
                  style={styles.badgeText}
                >
                  {(category?.name ?? "Uncategorized").toUpperCase()}
                </AppText>
              </View>
            </View>

            {/* Spec .selrow stack — optional fields simply don't render when absent */}
            <View style={styles.rows}>
              <SelRow icon="wallet" label="ACCOUNT" value={account?.name ?? "—"} />
              <SelRow icon="date" label="DATE" value={formatFullDate(transaction.occurredAt)} />
              {!!transaction.location && (
                <SelRow icon="location" label="LOCATION" value={transaction.location} />
              )}
              {!!transaction.receiptUrl && (
                <SelRow icon="receipt" label="RECEIPT" value="View receipt" valueColor="primary" chevron />
              )}
            </View>

            <View style={styles.actions}>
              {/* Transfers can't be edited (the form has no transfer mode yet) — delete + recreate */}
              {transaction.type !== "transfer" && (
                <View style={styles.actionBtn}>
                  <Button
                    label="Edit"
                    variant="secondary"
                    icon="edit"
                    onPress={() => handleEdit()}
                  />
                </View>
              )}
              <View style={styles.actionBtn}>
                <Button label="Delete" variant="dangerGhost" icon="delete" onPress={() => setConfirmView(true)} />
              </View>
            </View>
          </>
        ) : (
          <>
            {/* Spec Tier-1 destructive confirm — honest consequence line, red CTA on top */}
            <View style={styles.confirm}>
              <Icon
                name="delete"
                size={30}
                containerSize={64}
                containerRadius={21}
                container="square"
                gradient="danger"
              />
              <AppText size="md" weight="black">
                Delete this transaction?
              </AppText>
              <AppText size="sm" color="inkDim" style={styles.confirmCopy}>
                {`${formatMoney(Math.abs(amount))} · ${transaction.title} will be removed. Budgets and insights update immediately. This can't be undone.`}
              </AppText>
              {deleteError && (
                <AppText size="xs" color="danger" style={styles.confirmCopy}>
                  {deleteError}
                </AppText>
              )}
            </View>
            <View style={styles.confirmActions}>
              <Button
                label="Delete Transaction"
                variant="danger"
                onPress={() => handleDelete()}
                loading={deleting}
              />
              <Button label="Cancel" variant="ghost" onPress={() => setConfirmView(false)} />
            </View>
          </>
        )
      )}
    </AppSheet>
  )
})

TransactionDetailSheet.displayName = "TransactionDetailSheet";

const styles = StyleSheet.create({
  // Spec .centerid — same centered identity rhythm as the goal sheets
  identity: {
    alignItems: "center",
    gap: 8,
  },
  // Spec .badge — tinted pill; bg = category soft tint, text = category color
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 11,
    letterSpacing: 1, // spec .08em caps tracking
  },
  rows: {
    gap: spacing.md,
  },
  // Spec .selrow ×1.25 — glass strip, hairline, 16 radius
  selRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  selCol: {
    flex: 1, // fills the middle so a trailing › lands at the far edge
    gap: 2,
  },
  selLabel: {
    fontSize: 12, // spec .k 9.5px ×1.25
    letterSpacing: 0.8,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
  },
  confirm: {
    alignItems: "center",
    gap: spacing.sm,
  },
  confirmCopy: {
    textAlign: "center",
  },
  confirmActions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});

export default TransactionDetailSheet;