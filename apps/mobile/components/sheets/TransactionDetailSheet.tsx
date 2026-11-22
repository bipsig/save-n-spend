import type { ITransaction } from "@save-n-spend/types";
import AppSheet from "@/components/sheets/AppSheet";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import Money from "../ui/Money";
import { useAccountById } from "@/lib/accounts";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useCategoryById, useCategoryLabel } from "@/lib/categories";
import Icon from "../ui/Icon";
import { ArchivedBadgeSegment, ArchivedChip } from "../ui/ArchivedMark";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { colors, spacing } from "@/theme";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { AppText } from "../ui/AppText";
import Caps from "../ui/Caps";
import Button from "../ui/Button";
import { formatFullDate } from "@/lib/date";
import { categoryBg } from "@/lib/categories";
import { toast } from "@/store/toast";
import { useRouter } from "expo-router";
import { useAccountStore } from "@/store/accounts";
import { useOnlineGate } from "@/lib/onlineGate";
import { deleteTarget, deleteWithUndo } from "@/lib/undo";
import AccountPickerSheet from "@/components/sheets/AccountPickerSheet";
import { convertToInvestment, holdingLook } from "@/lib/investments";
import { holderFor } from "@/lib/idempotency";
import { useTrip } from "@/lib/trips";

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
      <Caps size="sm">{label}</Caps>
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
  const convertRef = useRef<BottomSheetModal>(null);

  const router = useRouter();
  // Editing, converting and deleting reach the server directly; only a new transaction queues.
  const editGate = useOnlineGate("Edit");
  const convertGate = useOnlineGate("Convert to investment");
  const deleteGate = useOnlineGate("Delete");
  const confirmDeleteGate = useOnlineGate("Delete transaction");

  const account = useAccountById(transaction?.account);
  const toAccount = useAccountById(transaction?.toAccount);
  const category = useCategoryById(transaction?.category); // icon + colour
  const categoryLabel = useCategoryLabel(transaction?.category); // name + parent

  // A transfer has no title and no category, so everything below that reads one of those
  // has to be told: otherwise the sheet opens on a blank heading, an "Uncategorised" badge
  // and a green "+ ₹1,000" for money that only moved between the user's own accounts.
  const isTransfer = transaction?.type === "transfer";
  // A transfer into an investment account is a contribution; out of one, a redemption.
  const toInvestment = isTransfer && toAccount?.type === "investment";
  const fromInvestment = isTransfer && account?.type === "investment";
  const isInvestment = toInvestment || fromInvestment;
  const moveLabel = toInvestment ? "Invested" : fromInvestment ? "Redeemed" : "Transfer";
  const look = holdingLook(toInvestment ? toAccount : fromInvestment ? account : null);
  // Made by a trip. A trip expense's transactions (your share, what a friend owes on it) only
  // change through the trip, which rewrites them together; a settle-up stands alone.
  const tripExpense = !!transaction?.tripExpenseId;
  const { data: trip } = useTrip(transaction?.tripId ?? undefined);
  const tripLabel = trip ? `your ${trip.trip.name} trip` : "a trip";
  const openTrip = () => {
    if (!transaction?.tripId) return;
    innerRef.current?.dismiss();
    router.push({ pathname: "/trip-detail", params: { id: transaction.tripId } });
  };
  const title = isTransfer ? moveLabel : transaction?.title ?? "Transaction";
  // Subscribes this sheet to the mask so the delete-confirm's inline amount reveals with
  // everything else. `<Money>` handles its own; a `formatMoney` in a template string can't.
  usePrivacyMask();

  const [confirmView, setConfirmView] = useState(false);

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

  // Turn this expense into an investment contribution. Picks the destination holding,
  // then hands off to the API's convert endpoint (expense → transfer into that account).
  const openConvert = () => {
    convertRef.current?.present();
  };

  const handleConvert = async (toAccountId: string) => {
    if (!transaction) return;
    try {
      const idem = holderFor(`transaction:${transaction._id}:convert`);
      const path = `/transactions/${transaction._id}/convert-to-investment`;
      await convertToInvestment(transaction._id, toAccountId, { idempotencyKey: idem.keyFor("POST", path, { toAccount: toAccountId }) });
      idem.reset();
      dismiss();
      toast.success("Moved to your investments");
      onCommitted?.();
    }
    catch (err) {
      toast.fromError(err, "Couldn't convert. Try again.");
    }
  };

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
    dismiss();
    deleteWithUndo({
      ...deleteTarget.transaction(transaction._id),
      label: title,
      // Names the row so the receipt still means something once the sheet — the only place
      // that named the account — has already closed.
      message: isTransfer ? "Transfer deleted" : `${title} deleted`,
      // A delete reverts the balance move it made: the account list held elsewhere (Net
      // Worth, the account picker) is stale until this reloads it.
      reload: () => useAccountStore.getState().load(),
      onCommitted,
    });
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
              <ArchivedChip archived={!isTransfer && categoryLabel.isArchived} chipSize={64}>
                <Icon
                  name={isInvestment ? look.icon : isTransfer ? "transfer" : ((category?.icon ?? "activity") as IconName)}
                  size={30}
                  containerSize={64}
                  containerRadius={21}
                  container="square"
                  gradient={isInvestment ? look.tint : isTransfer ? "teal" : ((category?.color ?? "accent") as ColorToken)}
                />
              </ArchivedChip>
              <AppText size="md" weight="black">
                {title}
              </AppText>
              {/* The one amount with nothing to compete with, so it is the most
                  natural peek target in the app — this is the sheet a user opens
                  precisely because they want to see the figure. A transfer gets no
                  sign and no colour: it neither earned nor spent anything. */}
              <Money
                value={amount}
                sign={isTransfer ? "none" : "always"}
                size="xl"
                weight="black"
                color={isTransfer ? "ink" : amount < 0 ? "danger" : "success"}
              />
              {isTransfer ? (
                <AppText size="xs" color="inkDim">
                  {toInvestment
                    ? "Money moved into your investments — not spending"
                    : fromInvestment
                      ? "Money moved out of your investments — not income"
                      : "Moved between your accounts — not income or spending"}
                </AppText>
              ) : (
                <>
                  <View style={styles.badgeRow}>
                    <View
                      style={[styles.badge, categoryLabel.isArchived && styles.badgeSplit, { backgroundColor: colors[categoryBg(category?.color)] }]}
                    >
                      <AppText
                        weight="black"
                        color={(category?.color ?? "accent") as ColorToken}
                        numberOfLines={1}
                        style={[styles.badgeText, categoryLabel.isArchived && styles.badgeTextSplit]}
                      >
                        {categoryLabel.name}
                      </AppText>
                      {categoryLabel.isArchived && <ArchivedBadgeSegment />}
                    </View>
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
                  <SelRow icon="wallet" label="From" value={account?.name ?? "—"} />
                  <SelRow icon={toInvestment ? "investments" : "transfer"} label={toInvestment ? "Invested in" : "To"} value={toAccount?.name ?? "—"} />
                </>
              ) : (
                <SelRow icon="wallet" label="Account" value={account?.name ?? "—"} />
              )}
              <SelRow icon="date" label="Date" value={formatFullDate(transaction.occurredAt)} />
              {!!transaction.note && (
                <SelRow icon="note" label="Note" value={transaction.note} />
              )}
              {!!transaction.location && (
                <SelRow icon="location" label="Location" value={transaction.location} />
              )}
              {!!transaction.receiptUrl && (
                <SelRow icon="receipt" label="Receipt" value="View receipt" valueColor="primary" chevron />
              )}
            </View>

            {transaction.tripId && (
              <View style={styles.tripNote}>
                <Icon name="flight" size={16} color="primary" />
                <AppText size="xs" color="inkSecondary" style={styles.tripNoteText}>
                  {tripExpense
                    ? `Part of ${tripLabel} — add, change or remove it from the trip.`
                    : `A settle-up on ${tripLabel}.`}
                </AppText>
              </View>
            )}
            {transaction.tripId && <Button label="Open trip" variant="secondary" icon="flight" onPress={openTrip} />}

            {!tripExpense && (<>
            {/* Full width and ahead of Edit/Delete — the one action worth repeating without
                retyping (chai, metro, coffee) shouldn't compete for space with a
                destructive one right next to it. */}
            {/* Not for a settle-up either: repeating it would be a second payment outside the
                trip, which isn't what "again" means for paying someone back. */}
            {!transaction.tripId && (
              <Button
                label="Log again today"
                variant="secondary"
                icon="repeat"
                onPress={() => handleRepeat()}
              />
            )}

            {/* Backward-compat: an expense that was really a SIP/investment can be moved
                out of spending into a holding. Expense-only — income/transfers aren't it. */}
            {transaction.type === "expense" && !transaction.splitGroupId && (
              <Button
                label={convertGate.label}
                variant="secondary"
                icon={convertGate.icon ?? "investments"}
                hint={convertGate.hint}
                disabled={!convertGate.allowed}
                onPress={openConvert}
              />
            )}

            <View style={styles.actions}>
              {/* Transfers can't be edited (the form has no transfer mode yet) — delete + recreate */}
              {transaction.type !== "transfer" && (
                <View style={styles.actionBtn}>
                  <Button
                    label={editGate.label}
                    variant="secondary"
                    icon={editGate.icon ?? "edit"}
                    hint={editGate.hint}
                    disabled={!editGate.allowed}
                    onPress={() => handleEdit()}
                  />
                </View>
              )}
              <View style={styles.actionBtn}>
                <Button
                  label={deleteGate.label}
                  variant="dangerGhost"
                  icon={deleteGate.icon ?? "delete"}
                  hint={deleteGate.hint}
                  disabled={!deleteGate.allowed}
                  onPress={() => setConfirmView(true)}
                />
              </View>
            </View>
            </>)}
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
                label={confirmDeleteGate.label}
                icon={confirmDeleteGate.icon}
                hint={confirmDeleteGate.hint}
                variant="danger"
                disabled={!confirmDeleteGate.allowed}
                onPress={handleDelete}
              />
              <Button label="Cancel" variant="ghost" onPress={() => setConfirmView(false)} />
            </View>
          </Animated.View>
        )
      )}
      <AccountPickerSheet
        ref={convertRef}
        title="Convert into"
        filterType="investment"
        onPick={(pickedId) => void handleConvert(pickedId)}
      />
    </AppSheet>
  )
})

TransactionDetailSheet.displayName = "TransactionDetailSheet";

const styles = StyleSheet.create({
  tripNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(155,140,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(155,140,255,0.30)",
  },
  tripNoteText: { flex: 1, lineHeight: 17 },
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
  // Caps the badge at the column's width, so a long name truncates instead of running
  // off both edges of the sheet.
  badgeRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    justifyContent: "center",
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 999,
    flexShrink: 1,
  },
  // Capitals from the style, so VoiceOver reads the name rather than spelling it.
  badgeText: {
    fontSize: 11,
    letterSpacing: 1, // spec .08em caps tracking
    textTransform: "uppercase",
  },
  // Archived: the badge becomes two segments, the name and ArchivedBadgeSegment.
  badgeSplit: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 0,
    paddingVertical: 0,
    overflow: "hidden",
  },
  badgeTextSplit: {
    flexShrink: 1,
    paddingVertical: 4,
    paddingLeft: 12,
    paddingRight: 10,
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