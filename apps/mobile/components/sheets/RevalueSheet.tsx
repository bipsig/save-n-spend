import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import { AppText } from "@/components/ui/AppText";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { syncAccountBalance } from "@/lib/accounts";
import { haptics } from "@/lib/haptics";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { toast } from "@/store/toast";
import { spacing } from "@/theme";

/** What each row needs to frame a revaluation as investment growth, not an account reset. */
export type RevalueHolding = {
  accountId: string;
  name: string;
  /** Net contributions — the cost basis growth is measured against. */
  invested: number;
  /** Current recorded value (the account balance). */
  current: number;
};

type Props = {
  holdings: RevalueHolding[];
  onSaved?: () => void;
};

// Rupees a human typed → integer paise, or null if unparseable. A holding can't be worth
// less than nothing, so negatives are refused.
const toPaise = (rupees: string): number | null => {
  const value = Number(rupees.replace(/[₹,\s]/g, ""));
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
};

// The monthly "what's it worth today" pass. Each row shows what was invested and the growth
// the entered value implies — so this reads as tracking a portfolio against its cost basis,
// NOT as overwriting an account balance. Under the hood the new value is recorded via
// `syncAccountBalance`, which keeps `invested` untouched (it's the sum of contributions);
// growth = value − invested. Blank rows are skipped. Values aren't prefilled, so a real
// figure never lands in a field privacy mode can't mask.
const RevalueSheet = forwardRef<BottomSheetModal, Props>(({ holdings, onSaved }, ref) => {
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const dismiss = () => innerRef.current?.dismiss();
  usePrivacyMask(); // subscribe: the invested/now/growth labels read formatMoney()

  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setValues({});
    setBusy(false);
    setError(null);
  };

  const save = async () => {
    const changes: { id: string; paise: number }[] = [];
    for (const h of holdings) {
      const raw = values[h.accountId]?.trim();
      if (!raw) continue; // left blank — unchanged
      const paise = toPaise(raw);
      if (paise === null) {
        haptics.error();
        setError(`Enter ${h.name}'s value as a number, or leave it blank.`);
        return;
      }
      if (paise !== h.current) changes.push({ id: h.accountId, paise });
    }

    if (changes.length === 0) {
      dismiss();
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // Sequential: each sync writes an adjustment and reloads the account store, and
      // overlapping reloads would thrash it.
      for (const change of changes) {
        await syncAccountBalance(change.id, change.paise);
      }
      onSaved?.();
      dismiss();
      toast.success(`Updated ${changes.length} value${changes.length === 1 ? "" : "s"}`);
    }
    catch (err) {
      haptics.error();
      setError(err instanceof Error ? err.message : "Couldn't update. Try again.");
    }
    finally {
      setBusy(false);
    }
  };

  return (
    <AppSheet
      ref={innerRef}
      scrollable
      onDismiss={reset}
      footer={<Button label="Save values" loading={busy} onPress={save} />}
    >
      <View style={styles.identity}>
        <Icon name="investments" size={24} containerSize={52} container="square" gradient="green" />
        <View style={styles.identityText}>
          <AppText size="md" weight="black">Update values</AppText>
          <AppText size="sm" color="inkDim">
            Enter what each is worth today. Growth is measured against what you invested — it
            won&apos;t touch your spending.
          </AppText>
        </View>
      </View>

      {holdings.map((h) => {
        const raw = values[h.accountId]?.trim();
        const entered = raw ? toPaise(raw) : null;
        const growth = entered !== null ? entered - h.invested : null;
        return (
          <View key={h.accountId} style={styles.row}>
            <View style={styles.rowText}>
              <AppText size="sm" weight="bold" numberOfLines={1}>{h.name}</AppText>
              <AppText size="xs" color="inkDim">
                Invested {formatMoney(h.invested)} · now {formatMoney(h.current)}
              </AppText>
              {growth !== null && (
                <AppText size="xs" weight="bold" color={growth >= 0 ? "success" : "danger"}>
                  {growth >= 0 ? "▲ " : "▼ "}{formatMoney(Math.abs(growth))} growth
                </AppText>
              )}
            </View>
            <View style={styles.input}>
              <AppText size="sm" color="inkDim">₹</AppText>
              <BottomSheetTextInput
                value={values[h.accountId] ?? ""}
                onChangeText={(v) => setValues((prev) => ({ ...prev, [h.accountId]: v }))}
                placeholder="0"
                placeholderTextColor="rgba(245,244,252,0.35)"
                keyboardType="decimal-pad"
                style={styles.inputField}
              />
            </View>
          </View>
        );
      })}

      <AppText size="xs" color="inkDim" style={styles.note}>
        Leave one blank to skip it. You can update anytime, not just today.
      </AppText>

      {error && <AppText size="sm" color="danger">{error}</AppText>}
    </AppSheet>
  );
});

RevalueSheet.displayName = "RevalueSheet";

const styles = StyleSheet.create({
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  identityText: {
    flex: 1,
    gap: 3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  input: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    width: 128,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(155,140,255,0.6)",
  },
  inputField: {
    flex: 1,
    paddingVertical: 11,
    textAlign: "right",
    fontSize: 15,
    fontWeight: "800",
    color: "#F5F4FC",
  },
  note: {
    lineHeight: 17,
  },
});

export default RevalueSheet;
