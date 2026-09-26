import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import { AppText } from "@/components/ui/AppText";
import Button from "@/components/ui/Button";
import HoldButton from "@/components/ui/HoldButton";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import { deleteInvestment, type DeleteInvestmentMode } from "@/lib/investments";
import { haptics } from "@/lib/haptics";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { colors, spacing } from "@/theme";

export type DeleteInvestmentSummary = {
  id: string;
  name: string;
  /** Money moved in from other accounts, and which ones. */
  moneyIn: { count: number; total: number; from: string[] };
  /** Money moved out (redemptions) to other accounts. */
  moneyOut: { count: number; total: number; to: string[] };
  valueUpdates: number;
  /** SIP bills that fund this holding — deleted with it. */
  sipBills: string[];
};

type Props = {
  summary: DeleteInvestmentSummary | null;
  onDeleted: () => void;
};

const names = (list: string[]) => (list.length <= 2 ? list.join(" and ") : `${list.slice(0, 2).join(", ")} and others`);

const Choice = ({ selected, title, body, onPress }: { selected: boolean; title: string; body: string; onPress: () => void }) => (
  <PressableScale
    onPress={onPress}
    scaleTo={0.98}
    style={[styles.choice, selected && styles.choiceOn]}
    accessibilityRole="radio"
    accessibilityState={{ selected }}
  >
    <View style={[styles.radio, selected && styles.radioOn]}>{selected && <View style={styles.radioDot} />}</View>
    <View style={styles.choiceText}>
      <AppText size="sm" weight="bold">{title}</AppText>
      <AppText size="xs" color="inkDim" style={styles.lh}>{body}</AppText>
    </View>
  </PressableScale>
);

// Deleting a holding outright, to start over. Says exactly what goes with it, and asks the
// one thing that can't be guessed: whether the money moved into it really moved. If it did
// (the holding was just set up wrong), the bank's balance must stay put; if the entries
// were mistakes, the money goes back. Held, not tapped — none of it can be undone.
const DeleteInvestmentSheet = forwardRef<BottomSheetModal, Props>(({ summary, onDeleted }, ref) => {
  usePrivacyMask();
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  // Keep by default: it's the choice that never changes another account's balance.
  const [mode, setMode] = useState<DeleteInvestmentMode>("keep");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!summary) return <AppSheet ref={innerRef}><View /></AppSheet>;
  const { moneyIn, moneyOut } = summary;
  const movedMoney = moneyIn.count + moneyOut.count > 0;
  // Every account on the other side of a money move — what "keep" leaves alone.
  const others = [...new Set([...moneyIn.from, ...moneyOut.to])];

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteInvestment(summary.id, mode);
      innerRef.current?.dismiss();
      onDeleted();
    }
    catch (err) {
      haptics.error();
      setError(err instanceof Error ? err.message : "Couldn't delete it. Try again.");
    }
    finally {
      setBusy(false);
    }
  };

  const goes: string[] = [];
  if (moneyIn.count) goes.push(`${moneyIn.count} payment${moneyIn.count === 1 ? "" : "s"} in (${formatMoney(moneyIn.total)})`);
  if (moneyOut.count) goes.push(`${moneyOut.count} redemption${moneyOut.count === 1 ? "" : "s"} (${formatMoney(moneyOut.total)})`);
  if (summary.valueUpdates) goes.push(`${summary.valueUpdates} value update${summary.valueUpdates === 1 ? "" : "s"}`);
  if (summary.sipBills.length) goes.push(`the SIP bill${summary.sipBills.length === 1 ? "" : "s"} ${names(summary.sipBills)}`);

  return (
    <AppSheet ref={innerRef} scrollable onDismiss={() => { setError(null); setMode("keep"); }}>
      <View style={styles.header}>
        <Icon name="delete" size={22} container="square" containerSize={48} containerRadius={16} gradient="red" />
        <View style={styles.headerText}>
          <AppText size="md" weight="black" numberOfLines={2}>Delete {summary.name}?</AppText>
          <AppText size="xs" color="inkDim" style={styles.lh}>
            {goes.length
              ? `It goes completely, with ${goes.join(", ")}. You can add it again from scratch.`
              : "It goes completely. You can add it again from scratch."}
          </AppText>
        </View>
      </View>

      {movedMoney && (
        <View style={styles.choices}>
          <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>THE MONEY YOU MOVED</AppText>
          <Choice
            selected={mode === "keep"}
            onPress={() => setMode("keep")}
            title="It really moved — keep my balances"
            body={`${names(others)} ${others.length === 1 ? "stays exactly as it is" : "stay exactly as they are"}. Pick this if you're setting the holding up again.`}
          />
          <Choice
            selected={mode === "undo"}
            onPress={() => setMode("undo")}
            title="They were mistakes — undo them"
            body={[
              moneyIn.count ? `${formatMoney(moneyIn.total)} goes back to ${names(moneyIn.from)}` : null,
              moneyOut.count ? `${formatMoney(moneyOut.total)} comes back out of ${names(moneyOut.to)}` : null,
            ].filter(Boolean).join("; ") + ", as if they never happened."}
          />
        </View>
      )}

      {error && <AppText size="sm" color="danger">{error}</AppText>}

      <View style={styles.actions}>
        <HoldButton label="Hold to delete" holdingLabel="Keep holding to delete…" icon="delete" loading={busy} onComplete={run} />
        <Button label="Cancel" variant="ghost" disabled={busy} onPress={() => innerRef.current?.dismiss()} />
      </View>
    </AppSheet>
  );
});

DeleteInvestmentSheet.displayName = "DeleteInvestmentSheet";

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headerText: { flex: 1, gap: 3 },
  lh: { lineHeight: 17 },
  label: { letterSpacing: 1.3 },
  choices: { gap: spacing.sm },
  choice: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  choiceOn: { borderColor: colors.primary, backgroundColor: colors.accentSoft },
  choiceText: { flex: 1, gap: 3 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  actions: { gap: spacing.sm },
});

export default DeleteInvestmentSheet;
