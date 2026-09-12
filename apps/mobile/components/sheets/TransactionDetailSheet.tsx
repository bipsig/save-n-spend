import type { ITransaction } from "@save-n-spend/types";
import AppSheet from "@/components/sheets/AppSheet";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import Money from "../ui/Money";
import { useAccountById } from "@/lib/accounts";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useCategoryById, useCategoryLabel } from "@/lib/categories";
import Icon from "../ui/Icon";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { colors, spacing } from "@/theme";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { AppText } from "../ui/AppText";
import Button from "../ui/Button";
import { formatFullDate } from "@/lib/date";
import { categoryBg } from "@/lib/categories";
import { del } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { toast } from "@/store/toast";
import { useRouter } from "expo-router";
import { useAccountStore } from "@/store/accounts";

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
  // Own handle, so `dismiss` closes this sheet rather than whatever happens to sit
  // on top of the provider-wide queue (see CategoryPickerSheet).
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const dismiss = () => innerRef.current?.dismiss();

  const router = useRouter();

  const account = useAccountById(transaction?.account);
  const toAccount = useAccountById(transaction?.toAccount);
  const category = useCategoryById(transaction?.category); // icon + colour
  const categoryLabel = useCategoryLabel(transaction?.category); // name + parent

  // A transfer has no title and no category, so everything below that reads one of those
  // has to be told: otherwise the sheet opens on a blank heading, an "Uncategorised" badge
  // and a green "+ ₹1,000" for money that only moved between the user's own accounts.
  const isTransfer = transaction?.type === "transfer";
  const title = isTransfer ? "Transfer" : transaction?.title ?? "Transaction";
  // Subscribes this sheet to the mask so the delete-confirm's inline amount reveals with
  // everything else. `<Money>` handles its own; a `formatMoney` in a template string can't.
  usePrivacyMask();

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
      // A delete reverts the balance move it made — the account list held elsewhere
      // (Net Worth, the account picker) is stale until this reloads it.
      await useAccountStore.getState().load();
      onDeleted?.();
      dismiss();
      // Names the row and says the balance moved with it: a delete silently rewrites an
      // account total, and the sheet that explained that has just closed.
      toast.success(isTransfer
        ? "Transfer deleted — both balances restored"
        : `${title} deleted — ${account?.name ?? "your account"} updated`);
    }
    catch (err) {
      // The one failure that must not be missed: they just confirmed something destructive
      // and would otherwise walk away believing it happened.
      haptics.error();
      setDeleteError(err instanceof Error ? err.message : "Error deleting the transaction");
    }
    finally {
      setDeleting(false);
    }
  }

  return (
    <AppSheet ref={innerRef} onDismiss={() => { setConfirmView(false); setDeleteError (null); }}>
      {transaction && (
        !confirmView ? (
          // Entering only: an exiting animation keeps both views mounted, and the sheet
          // sizes to its content — so it would stretch to fit the pair, then snap back.
          <Animated.View entering={FadeIn.duration(160)} style={styles.view}>
            {/* Spec §08 .centerid — chip · title · spaced-sign amount · tinted badge */}
            <View style={styles.identity}>
              <Icon
                name={isTransfer ? "transfer" : ((category?.icon ?? "activity") as IconName)}
                size={30}
                containerSize={64}
                containerRadius={21}
                container="square"
                gradient={isTransfer ? "teal" : ((category?.color ?? "accent") as ColorToken)}
              />
              <AppText size="md" weight="black">
                {title}
              </AppText>
              {/* The one amount with nothing to compete with, so it is the most
                  natural peek target in the app — this is the sheet a user opens
                  precisely because they want to see the figure. A transfer gets no
                  sign and no colour: it neither earned nor spent anything. */}
              <Money
                value={Math.abs(amount)}
                prefix={isTransfer ? "" : amount < 0 ? "− " : "+ "}
                size="xl"
                weight="black"
                color={isTransfer ? "ink" : amount < 0 ? "danger" : "success"}
              />
              {isTransfer ? (
                <AppText size="xs" color="inkDim">
                  Moved between your accounts — not income or spending
                </AppText>
              ) : (
                <>
                  <View
                    style={[styles.badge, { backgroundColor: colors[categoryBg(category?.color)] }]}
                  >
                    <AppText
                      weight="black"
                      color={(category?.color ?? "accent") as ColorToken}
                      style={styles.badgeText}
                    >
                      {categoryLabel.name.toUpperCase()}
                    </AppText>
                  </View>
                  {/* Under the badge rather than inside it: the badge is tinted with the
                      category's own colour and sized to one word, and stuffing a parent
                      name in would break both. This is the sheet someone opens to check
                      where a purchase was filed, so the heading it rolls up into belongs
                      on it — just not shouting. */}
                  {categoryLabel.isChild && (
                    <AppText size="xs" color="inkDim">
                      {`in ${categoryLabel.parentName}`}
                    </AppText>
                  )}
                </>
              )}
            </View>

            {/* Spec .selrow stack — optional fields simply don't render when absent */}
            <View style={styles.rows}>
              {isTransfer ? (
                <>
                  <SelRow icon="wallet" label="FROM" value={account?.name ?? "—"} />
                  <SelRow icon="transfer" label="TO" value={toAccount?.name ?? "—"} />
                </>
              ) : (
                <SelRow icon="wallet" label="ACCOUNT" value={account?.name ?? "—"} />
              )}
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
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(160)} style={styles.view}>
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
                {isTransfer ? "Delete this transfer?" : "Delete this transaction?"}
              </AppText>
              <AppText size="sm" color="inkDim" style={styles.confirmCopy}>
                {isTransfer
                  ? `${formatMoney(Math.abs(amount))} goes back to ${account?.name ?? "the source account"}, and off ${toAccount?.name ?? "the destination"}. This can't be undone.`
                  : `${formatMoney(Math.abs(amount))} · ${title} will be removed. Budgets and insights update immediately. This can't be undone.`}
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
          </Animated.View>
        )
      )}
    </AppSheet>
  )
})

TransactionDetailSheet.displayName = "TransactionDetailSheet";

const styles = StyleSheet.create({
  // The fading wrapper carries the gap, since its children no longer get the sheet's.
  view: {
    gap: spacing.lg,
  },
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