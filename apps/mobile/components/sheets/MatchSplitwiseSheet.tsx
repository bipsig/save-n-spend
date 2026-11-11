import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import type { TripMemberBalance, TripPlan } from "@save-n-spend/types";
import AppSheet from "./AppSheet";
import { AppText } from "@/components/ui/AppText";
import Button from "@/components/ui/Button";
import PressableScale from "@/components/ui/PressableScale";
import { haptics } from "@/lib/haptics";
import formatMoney, { parseMoney, paiseToInput, usePrivacyMask } from "@/lib/money";
import { clearPlan, savePlan } from "@/lib/trips";
import { toast } from "@/store/toast";
import { colors, spacing } from "@/theme";

type Props = {
  tripId: string;
  members: TripMemberBalance[];
  plan: TripPlan | null;
  onSaved: () => void;
};

type Row = { text: string; owes: boolean };

const rowsFrom = (members: TripMemberBalance[], plan: TripPlan | null): Record<string, Row> =>
  Object.fromEntries(members.map((m) => {
    const saved = plan?.entries.find((e) => e.account === m.account)?.amount ?? 0;
    return [m.account, { text: saved === 0 ? "" : paiseToInput(Math.abs(saved)), owes: saved >= 0 }];
  }));

// With "simplify debts" on, Splitwise re-routes who pays whom, so what each person will pay you
// can differ from the exact split. This is where you type what Splitwise tells them to pay;
// the amounts must add up to what you're owed overall, which is what catches a typo.
const MatchSplitwiseSheet = forwardRef<BottomSheetModal, Props>(({ tripId, members, plan, onSaved }, ref) => {
  usePrivacyMask();
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);

  const [rows, setRows] = useState<Record<string, Row>>(() => rowsFrom(members, plan));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setRows(rowsFrom(members, plan));
    setError(null);
  }, [members, plan]);
  useEffect(() => { reset(); }, [reset]);

  const signed = (m: TripMemberBalance) => {
    const r = rows[m.account];
    const value = parseMoney(r?.text ?? "") || 0;
    return r?.owes === false ? -value : value;
  };

  const owedOverall = useMemo(() => members.reduce((sum, m) => sum + m.exact, 0), [members]);
  const entered = members.reduce((sum, m) => sum + signed(m), 0);
  const gap = owedOverall - entered;
  const balanced = gap === 0;

  const setRow = (account: string, patch: Partial<Row>) =>
    setRows((cur) => ({ ...cur, [account]: { ...cur[account], ...patch } }));

  const save = async () => {
    if (!balanced) { haptics.error(); return; }
    setBusy(true);
    setError(null);
    try {
      await savePlan(tripId, members.filter((m) => signed(m) !== 0).map((m) => ({ account: m.account, amount: signed(m) })));
      haptics.success();
      innerRef.current?.dismiss();
      onSaved();
      toast.success("Matched to Splitwise");
    }
    catch (err) {
      haptics.error();
      setError(err instanceof Error ? err.message : "Couldn't save that");
    }
    finally {
      setBusy(false);
    }
  };

  const backToExact = async () => {
    setBusy(true);
    try {
      await clearPlan(tripId);
      innerRef.current?.dismiss();
      onSaved();
      toast.info("Back to the exact amounts");
    }
    catch (err) {
      haptics.error();
      setError(err instanceof Error ? err.message : "Couldn't undo that");
    }
    finally {
      setBusy(false);
    }
  };

  const status = balanced
    ? `Adds up to ${formatMoney(Math.abs(owedOverall))} ✓`
    : `${formatMoney(Math.abs(gap))} ${gap > 0 ? "short" : "too much"} — should add up to ${formatMoney(Math.abs(owedOverall))}`;

  return (
    <AppSheet
      ref={innerRef}
      scrollable
      snapPoints={["92%"]}
      onDismiss={reset}
      footer={
        <View style={styles.footer}>
          <AppText size="xs" weight="bold" color={balanced ? "success" : "warning"} style={styles.center}>{status}</AppText>
          {error && <AppText size="sm" color="danger" style={styles.center}>{error}</AppText>}
          <Button label="Save" loading={busy} disabled={!balanced} onPress={save} />
        </View>
      }
    >
      <AppText size="md" weight="black">Match Splitwise</AppText>
      <AppText size="xs" color="inkDim" style={styles.lh}>
        Splitwise may have simplified who pays whom. Open the group there and enter what each person pays you. Anyone it doesn't list stays ₹0.
      </AppText>
      {plan?.stale && (
        <AppText size="xs" weight="bold" color="warning" style={styles.lh}>
          Expenses changed since you matched this — check these against Splitwise again.
        </AppText>
      )}

      {members.map((m) => {
        const r = rows[m.account] ?? { text: "", owes: true };
        return (
          <View key={m.account} style={styles.row}>
            <View style={styles.who}>
              <AppText size="sm" weight="bold" numberOfLines={1}>{m.name}</AppText>
              <AppText size="xs" color="inkDim" numberOfLines={1}>
                {m.exact === 0 ? "exact ₹0" : `exact ${m.exact > 0 ? "" : "−"}${formatMoney(Math.abs(m.exact))}`}
              </AppText>
            </View>
            <View style={styles.amount}>
              <BottomSheetTextInput
                value={r.text}
                onChangeText={(text) => setRow(m.account, { text })}
                placeholder="0"
                placeholderTextColor={colors.gray400}
                keyboardType="decimal-pad"
                style={styles.input}
              />
            </View>
            <PressableScale
              onPress={() => { haptics.tap(); setRow(m.account, { owes: !r.owes }); }}
              scaleTo={0.95}
              style={[styles.dir, !r.owes && styles.dirOwe]}
              accessibilityRole="button"
              accessibilityLabel={r.owes ? `${m.name} pays you. Tap if you pay them.` : `You pay ${m.name}. Tap if they pay you.`}
            >
              <AppText size="xs" weight="bold" color={r.owes ? "success" : "warning"}>{r.owes ? "pays you" : "you pay"}</AppText>
            </PressableScale>
          </View>
        );
      })}

      {plan && <Button label="Back to exact amounts" variant="ghost" icon="repeat" disabled={busy} onPress={backToExact} />}
    </AppSheet>
  );
});

MatchSplitwiseSheet.displayName = "MatchSplitwiseSheet";

const styles = StyleSheet.create({
  lh: { lineHeight: 18 },
  center: { textAlign: "center" },
  footer: { gap: spacing.sm },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)",
  },
  who: { flex: 1, minWidth: 0, gap: 2 },
  amount: { width: 104 },
  input: {
    borderWidth: 1, borderRadius: 12, borderColor: "rgba(255,255,255,0.13)", backgroundColor: "rgba(255,255,255,0.07)",
    paddingHorizontal: 12, paddingVertical: 10, color: colors.ink, fontWeight: "600", textAlign: "right",
  },
  dir: {
    width: 74, alignItems: "center", paddingVertical: 8, borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.13)",
  },
  dirOwe: { borderColor: colors.warning },
});

export default MatchSplitwiseSheet;
