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
import { toast } from "@/store/toast";
import { useRouter } from "expo-router";
import { useAccountStore } from "@/store/accounts";
import { useConnectivity } from "@/store/connectivity";
import { pendingDeletes } from "@/store/pendingDeletes";

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
  /** Fired once the delete actually commits — after the undo grace window elapses
   *  undisturbed, not at confirm-time (see handleDelete). Firing it earlier would
   *  refetch a transaction the server hasn't been told about yet and silently undo
   *  the optimistic hide. */
  onCommitted?: () => void
}

const TransactionDetailSheet = forwardRef<BottomSheetModal, Props>(({
  transaction,
  onCommitted
}, ref) => {
  // Own handle, so `dismiss` closes this sheet rather than whatever happens to sit
  // on top of the provider-wide queue (see CategoryPickerSheet).
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const dismiss = () => innerRef.current?.dismiss();

  const router = useRouter();
  const offline = useConnectivity((s) => s.offline);

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

  const amount = !transaction ? 0 : transaction?.type === "expense" ? -transaction.amount : transaction?.amount;

  const handleEdit = () => {
    // Editing patches the server directly (unlike a new transaction, it has no queue to
    // fall back to) — the account/category it names must already exist for its own sake.
    if (offline) {
      toast.error("You're offline — editing needs a connection");
      return;
    }
    dismiss();
    router.push({
      pathname: "/add-transaction",
      params: {
        id: transaction?._id
      }
    });
  }

  // Same transaction, landing on today instead of its own moment — a split's expense
  // already stores only the user's own share as its amount, so repeating one naturally
  // recreates a plain expense of that share with no split-awareness needed here.
  const handleRepeat = () => {
    dismiss();
    router.push({
      pathname: "/add-transaction",
      params: {
        repeatId: transaction?._id
      }
    });
  }

  // Nothing is actually sent to the server yet — the row disappears now, but the real
  // DELETE only fires if the undo grace window elapses undisturbed (store/pendingDeletes.ts).
  // This is what makes a split expense's delete simple despite the group-cascade the API
  // does on commit: since nothing is sent until then, "undo" is just "never send it," and
  // the group's real splitGroupId is never touched by anything client-side.
  const handleDelete = () => {
    if (!transaction) return;
    const key = `transaction:${transaction._id}`;
    const label = title;
    pendingDeletes.schedule(key, label, async () => {
      await del(`/transactions/${transaction._id}`);
      // A delete reverts the balance move it made — the account list held elsewhere
      // (Net Worth, the account picker) is stale until this reloads it. Caught rather
      // than awaited-and-thrown: a drop here means the delete itself still went through,
      // and the store's next successful load fills in the real number anyway.
      await useAccountStore.getState().load().catch(() => {});
      onCommitted?.();
    });
    dismiss();
    // Names the row so the receipt still means something once the sheet — the only place
    // that named the account — has already closed.
    toast.action(
      "info",
      isTransfer ? "Transfer deleted" : `${title} deleted`,
      { label: "Undo", onPress: () => pendingDeletes.cancel(key) }
    );
  }

  return (
    <AppSheet ref={innerRef} onDismiss={() => setConfirmView(false)}>
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
              {!!transaction.note && (
                <SelRow icon="note" label="NOTE" value={transaction.note} />
              )}
              {!!transaction.location && (
                <SelRow icon="location" label="LOCATION" value={transaction.location} />
              )}
              {!!transaction.receiptUrl && (
                <SelRow icon="receipt" label="RECEIPT" value="View receipt" valueColor="primary" chevron />
              )}
            </View>

            {/* Full width and ahead of Edit/Delete — the one action worth repeating without
                retyping (chai, metro, coffee) shouldn't compete for space with a
                destructive one right next to it. */}
            <Button
              label="Log again today"
              variant="secondary"
              icon="repeat"
              onPress={() => handleRepeat()}
            />

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
                <Button
                  label="Delete"
                  variant="dangerGhost"
                  icon="delete"
                  onPress={() => {
                    if (offline) {
                      toast.error("You're offline — deleting needs a connection");
                      return;
                    }
                    setConfirmView(true);
                  }}
                />
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
                  ? `${formatMoney(Math.abs(amount))} goes back to ${account?.name ?? "the source account"}, and off ${toAccount?.name ?? "the destination"}. You'll have a few seconds to undo it after.`
                  : `${formatMoney(Math.abs(amount))} · ${title} will be removed. Budgets and insights update immediately. You'll have a few seconds to undo it after.`}
              </AppText>
            </View>
            <View style={styles.confirmActions}>
              <Button
                label="Delete Transaction"
                variant="danger"
                onPress={handleDelete}
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