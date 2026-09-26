import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { IBill } from "@save-n-spend/types";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import AccountPickerSheet from "./AccountPickerSheet";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import { AppText } from "@/components/ui/AppText";
import { useCategoryById } from "@/lib/categories";
import { useAccountById, useDefaultAccount } from "@/lib/accounts";
import { useAccountStore } from "@/store/accounts";
import { post } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { toast } from "@/store/toast";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { spacing } from "@/theme";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { formatDueLabel, rollDueDate, formatFullDate } from "@/lib/date";

type Props = {
  bill: IBill | null;
  onChanged: () => void;
};

const Effect = ({ icon, color, children }: { icon: IconName; color: ColorToken; children: React.ReactNode }) => (
  <View style={styles.fxRow}>
    <Icon name={icon} size={18} color={color} />
    <AppText size="sm" color="inkSecondary" style={styles.fxText}>
      {children}
    </AppText>
  </View>
);

const MarkPaidSheet = forwardRef<BottomSheetModal, Props>(({ bill, onChanged }, ref) => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below
  // Own handle, so `dismiss` closes this sheet and not the account picker it opens
  // on top of itself (see CategoryPickerSheet).
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const dismiss = () => innerRef.current?.dismiss();

  const accountRef = useRef<BottomSheetModal>(null);
  const category = useCategoryById(bill?.category ?? null);
  const investment = useAccountById(bill?.toInvestment ?? null);
  const isSip = !!bill?.toInvestment;
  const defaultAccount = useDefaultAccount();

  const [accountId, setAccountId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pay" | "skip" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAccountId(bill?.account ?? defaultAccount?._id ?? null);
  }, [bill, defaultAccount?._id]);

  const payFrom = useAccountById(accountId) ?? defaultAccount;

  const run = async (action: "pay" | "skip") => {
    if (!bill) return;
    setBusy(action);
    setError(null);
    try {
      await post(`/bills/${bill._id}/${action}`, action === "pay" && accountId ? { account: accountId } : undefined);
      // Paying moves money (an expense, or a transfer into a holding). The account store
      // backs Net Worth's per-account rows and Add-Transaction's "available" line, and the
      // dashboard doesn't reload accounts on focus — so without this they'd read stale until
      // a manual reload. Skipping doesn't move money, so it needs no reload.
      if (action === "pay") await useAccountStore.getState().load().catch(() => {});
      dismiss();
      onChanged();
      // Names the consequence the sheet promised, so the receipt matches the preview:
      // paying moves money, skipping deliberately doesn't.
      toast.success(
        action === "pay"
          ? isSip
            ? `${formatMoney(bill.amount)} invested in ${investment?.name ?? bill.name}`
            : `${bill.name} paid — ${formatMoney(bill.amount)} logged`
          : `${bill.name} skipped this cycle — no money moved`
      );
    }
    catch (err) {
      // Kept in the sheet: the failure has to be read next to the effects it was
      // meant to cause, and the sheet stays open so they're still on screen.
      haptics.error();
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
    finally {
      setBusy(null);
    }
  };

  return (
    <>
    <AppSheet ref={innerRef} onDismiss={() => {
      // Back to the bill's own account — a "pay from" picked and then cancelled shouldn't stick.
      setAccountId(bill?.account ?? defaultAccount?._id ?? null);
      setError(null);
    }}>
      {bill && (
        <>
          <View style={styles.identity}>
            <Icon
              name={isSip ? "investments" : ((category?.icon ?? "bills") as IconName)}
              size={30}
              container="square"
              containerSize={64}
              containerRadius={21}
              gradient={isSip ? "green" : ((category?.color ?? "accent") as ColorToken)}
            />
            <AppText size="md" weight="black">
              {bill.name}
            </AppText>
            <AppText size="xs" color="inkDim">
              {`${formatMoney(bill.amount)} · ${formatDueLabel(bill.dueDate, bill.status, bill.lastPaidAt).toLowerCase()}`}
            </AppText>
          </View>

          <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
            WHAT HAPPENS
          </AppText>

          <View style={styles.effects}>
            {isSip ? (
              <Effect icon="investments" color="success">
                Invests <AppText size="sm" weight="bold" color="ink">{formatMoney(bill.amount)}</AppText> into {investment?.name ?? "your holding"} — not spending
              </Effect>
            ) : (
              <Effect icon="budgetOk" color="success">
                Logs a <AppText size="sm" weight="bold" color="ink">{formatMoney(bill.amount)}</AppText> expense in {category?.name ?? "Uncategorized"}
              </Effect>
            )}
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

          <PressableScale style={styles.selRow} onPress={() => accountRef.current?.present()} scaleTo={0.98}>
            <Icon name="wallet" size={18} color="inkDim" />
            <View style={styles.selText}>
              <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
                {isSip ? "INVEST FROM" : "PAY FROM"}
              </AppText>
              <AppText size="sm" weight="semibold">
                {payFrom?.name ?? "Default account"}
              </AppText>
            </View>
            <Icon name="chevronRight" size={20} color="inkDim" />
          </PressableScale>

          {error && (
            <AppText size="xs" color="danger">
              {error}
            </AppText>
          )}

          <Button
            label={isSip ? "Mark as invested" : "Mark as Paid"}
            variant="success"
            onPress={() => run("pay")}
            loading={busy === "pay"}
            disabled={busy !== null}
          />
          {bill.recurring && (
            <Button
              label="Skip this cycle"
              variant="ghost"
              onPress={() => run("skip")}
              loading={busy === "skip"}
              disabled={busy !== null}
            />
          )}
          <Button label="Cancel" variant="ghost" onPress={() => dismiss()} disabled={busy !== null} />
        </>
      )}
    </AppSheet>

    <AccountPickerSheet ref={accountRef} selectedId={accountId} onPick={setAccountId} />
    </>
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
