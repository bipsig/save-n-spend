import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { TripMemberBalance } from "@save-n-spend/types";
import AppSheet from "./AppSheet";
import AccountPickerSheet from "./AccountPickerSheet";
import { AppText } from "@/components/ui/AppText";
import AmountHeroInput from "@/components/ui/AmountHeroInput";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import { useAccountById, useDefaultAccount } from "@/lib/accounts";
import { haptics } from "@/lib/haptics";
import formatMoney, { parseMoney, paiseToInput, usePrivacyMask } from "@/lib/money";
import { settleTrip } from "@/lib/trips";
import { toast } from "@/store/toast";
import { spacing } from "@/theme";

type Props = {
  tripId: string;
  /** The person being settled with, and where things stand. */
  member: TripMemberBalance | null;
  onSaved: () => void;
};

// Settling up with one person. The direction follows the balance — they owe you, so they're
// paying you; you owe them, so you're paying — and the amount starts at the whole of it (a
// partial payment is fine). The account is where the money actually went or came from, so
// your bank balance moves and the trip's doesn't count it as spending.
const SettleSheet = forwardRef<BottomSheetModal, Props>(({ tripId, member, onSaved }, ref) => {
  usePrivacyMask();
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const accountRef = useRef<BottomSheetModal>(null);
  const defaultAccount = useDefaultAccount();

  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const theyOwe = (member?.balance ?? 0) > 0;
  const owed = Math.abs(member?.balance ?? 0);

  const resetForm = useCallback(() => {
    setAmount(owed > 0 ? paiseToInput(owed) : "");
    setAccountId(defaultAccount?._id ?? null);
    setError(null);
  }, [owed, defaultAccount?._id]);
  useEffect(() => { resetForm(); }, [resetForm, member?.account]);

  const account = useAccountById(accountId) ?? defaultAccount;
  const value = parseMoney(amount);

  const save = async () => {
    if (!member || !(value > 0)) { haptics.error(); setError("Enter the amount."); return; }
    if (!account) { haptics.error(); setError("Pick the account."); return; }
    setBusy(true);
    setError(null);
    try {
      await settleTrip(tripId, { person: member.account, account: account._id, amount: value, direction: theyOwe ? "received" : "paid" });
      innerRef.current?.dismiss();
      onSaved();
      toast.success(theyOwe ? `${member.name} paid you ${formatMoney(value)}` : `You paid ${member.name} ${formatMoney(value)}`);
    }
    catch (err) {
      haptics.error();
      setError(err instanceof Error ? err.message : "Couldn't record it");
    }
    finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AppSheet ref={innerRef} onDismiss={resetForm}>
        {member && (
          <>
            <AppText size="md" weight="black">{theyOwe ? `${member.name} pays you back` : `You pay ${member.name} back`}</AppText>
            <AppText size="xs" color="inkDim">
              {theyOwe ? `${member.name} owes you ${formatMoney(owed)} on this trip.` : `You owe ${member.name} ${formatMoney(owed)} on this trip.`} Paying part of it is fine.
            </AppText>
            <AmountHeroInput value={amount} onChangeText={setAmount} />
            <PressableScale style={styles.selRow} onPress={() => accountRef.current?.present()} scaleTo={0.98}>
              <Icon name="wallet" size={18} color="inkDim" />
              <View style={styles.grow}>
                <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>{theyOwe ? "RECEIVED INTO" : "PAID FROM"}</AppText>
                <AppText size="sm" weight="semibold">{account?.name ?? "Choose an account"}</AppText>
              </View>
              <Icon name="chevronRight" size={20} color="inkDim" />
            </PressableScale>
            {value > 0 && value < owed && (
              <AppText size="xs" color="inkDim">{formatMoney(owed - value)} will still be open.</AppText>
            )}
            <AppText size="xs" color="inkDim">Settling up isn't spending or income — it only moves money between you.</AppText>
            {error && <AppText size="sm" color="danger">{error}</AppText>}
            <Button label={theyOwe ? "Record payment received" : "Record payment"} loading={busy} onPress={save} />
          </>
        )}
      </AppSheet>
      <AccountPickerSheet ref={accountRef} title={theyOwe ? "Received into" : "Paid from"} selectedId={accountId} onPick={setAccountId} excludeTypes={["investment", "person"]} />
    </>
  );
});

SettleSheet.displayName = "SettleSheet";

const styles = StyleSheet.create({
  grow: { flex: 1 },
  label: { letterSpacing: 1.3 },
  selRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.13)", marginTop: spacing.xs },
});

export default SettleSheet;
