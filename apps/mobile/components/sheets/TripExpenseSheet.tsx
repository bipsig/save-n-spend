import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import type { ITripExpense, TripMemberBalance } from "@save-n-spend/types";
import AppSheet from "./AppSheet";
import AccountPickerSheet from "./AccountPickerSheet";
import CategoryPickerSheet from "./CategoryPickerSheet";
import ConfirmSheet from "./ConfirmSheet";
import { AppText } from "@/components/ui/AppText";
import AmountHeroInput from "@/components/ui/AmountHeroInput";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import DateField from "@/components/ui/DateField";
import Icon from "@/components/ui/Icon";
import Input from "@/components/ui/Input";
import PressableScale from "@/components/ui/PressableScale";
import { useAccountById, useDefaultAccount } from "@/lib/accounts";
import { useCategoryById } from "@/lib/categories";
import { haptics } from "@/lib/haptics";
import formatMoney, { parseMoney, paiseToInput, usePrivacyMask } from "@/lib/money";
import { addTripExpense, deleteTripExpense, splitEvenly, updateTripExpense } from "@/lib/trips";
import { toast } from "@/store/toast";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { colors, spacing } from "@/theme";

type Props = {
  tripId: string;
  members: TripMemberBalance[];
  /** The expense being edited, or null to add one. */
  expense: ITripExpense | null;
  /** Where a new expense's date starts — inside the trip. */
  defaultDate: Date;
  onSaved: () => void;
};

/** "me" or a member's account id — the key each person is tracked by in this form. */
type Who = string;
const ME = "me";

const AVATAR_TINTS = ["violet", "blue", "amber", "green", "red", "teal", "pink", "orange"] as const;

// Adding (or editing) one shared expense, from inside a trip only. Tap who paid, tick who's
// in, and each person's share shows as you go. What counts as your spending is your share.
const TripExpenseSheet = forwardRef<BottomSheetModal, Props>(({ tripId, members, expense, defaultDate, onSaved }, ref) => {
  usePrivacyMask();
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const categoryRef = useRef<BottomSheetModal>(null);
  const accountRef = useRef<BottomSheetModal>(null);
  const deleteRef = useRef<BottomSheetModal>(null);
  const defaultAccount = useDefaultAccount();

  const everyone: Who[] = useMemo(() => [ME, ...members.map((m) => m.account)], [members]);
  const nameOf = (w: Who) => (w === ME ? "You" : members.find((m) => m.account === w)?.name ?? "Someone");

  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<Date>(defaultDate);
  const [category, setCategory] = useState<string | null>(null);
  const [payer, setPayer] = useState<Who>(ME);
  const [paidFrom, setPaidFrom] = useState<string | null>(null);
  const [inSplit, setInSplit] = useState<Who[]>(everyone);
  const [mode, setMode] = useState<"equal" | "custom">("equal");
  const [custom, setCustom] = useState<Record<Who, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    if (expense) {
      setAmount(paiseToInput(expense.cost));
      setTitle(expense.title);
      setDate(new Date(expense.occurredAt));
      setCategory(expense.category);
      setPayer(expense.paidBy ?? ME);
      setPaidFrom(expense.paidFrom);
      const shared = expense.shares.filter((s) => s.amount > 0);
      setInSplit(shared.map((s) => s.account ?? ME));
      const even = splitEvenly(expense.cost, shared.length);
      const isEven = shared.every((s, i) => s.amount === even[i]);
      setMode(isEven ? "equal" : "custom");
      setCustom(Object.fromEntries(shared.map((s) => [s.account ?? ME, paiseToInput(s.amount)])));
    }
    else {
      setAmount("");
      setTitle("");
      setDate(defaultDate);
      setCategory(null);
      setPayer(ME);
      setPaidFrom(defaultAccount?._id ?? null);
      setInSplit(everyone);
      setMode("equal");
      setCustom({});
    }
    setError(null);
  }, [expense, defaultDate, defaultAccount?._id, everyone]);
  useEffect(() => { resetForm(); }, [resetForm]);

  const cost = parseMoney(amount);
  const categoryDoc = useCategoryById(category);
  const fromAccount = useAccountById(paidFrom) ?? defaultAccount;

  // Each person's share, in paise, in `everyone` order.
  const shares: { who: Who; amount: number }[] = useMemo(() => {
    const ins = everyone.filter((w) => inSplit.includes(w));
    if (mode === "equal") {
      const parts = splitEvenly(cost > 0 ? cost : 0, ins.length);
      return ins.map((w, i) => ({ who: w, amount: parts[i] }));
    }
    return ins.map((w) => ({ who: w, amount: parseMoney(custom[w] ?? "") || 0 }));
  }, [everyone, inSplit, mode, cost, custom]);

  const assigned = shares.reduce((s, x) => s + x.amount, 0);
  const myShare = shares.find((s) => s.who === ME)?.amount ?? 0;

  // What this expense does between you and the others, in words.
  const effect = (() => {
    if (!(cost > 0) || shares.length === 0) return null;
    if (payer === ME) {
      const owed = cost - myShare;
      return owed > 0 ? `They'll owe you ${formatMoney(owed)} · counts as ${formatMoney(myShare)} of your spending` : `Counts as ${formatMoney(myShare)} of your spending`;
    }
    if (myShare === 0) return `You're not in this one — it won't touch your spending`;
    return `You'll owe ${nameOf(payer)} ${formatMoney(myShare)} · counts as ${formatMoney(myShare)} of your spending`;
  })();

  const toggleIn = (w: Who) => {
    haptics.tap();
    setInSplit((cur) => (cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w]));
  };

  const save = async () => {
    if (!(cost > 0)) { haptics.error(); setError("Enter the amount."); return; }
    if (!title.trim()) { haptics.error(); setError("Give it a name."); return; }
    if (shares.length === 0) { haptics.error(); setError("Tick who it's split between."); return; }
    if (assigned !== cost) { haptics.error(); setError(`The shares add up to ${formatMoney(assigned)} — they need to make ${formatMoney(cost)}.`); return; }
    if (payer === ME && !fromAccount) { haptics.error(); setError("Pick the account you paid from."); return; }
    const draft = {
      title: title.trim(),
      occurredAt: date.toISOString(),
      category,
      cost,
      paidBy: payer === ME ? null : payer,
      paidFrom: payer === ME ? fromAccount!._id : null,
      shares: shares.map((s) => ({ account: s.who === ME ? null : s.who, amount: s.amount })),
    };
    setBusy(true);
    setError(null);
    try {
      if (expense) await updateTripExpense(tripId, expense._id, draft);
      else await addTripExpense(tripId, draft);
      innerRef.current?.dismiss();
      onSaved();
      toast.success(expense ? `${draft.title} updated` : `${draft.title} added · your share ${formatMoney(myShare)}`);
    }
    catch (err) {
      haptics.error();
      setError(err instanceof Error ? err.message : "Couldn't save it");
    }
    finally {
      setBusy(false);
    }
  };

  const tintFor = (w: Who) => (w === ME ? "teal" : AVATAR_TINTS[members.findIndex((m) => m.account === w) % AVATAR_TINTS.length]);

  return (
    <>
      <AppSheet
        ref={innerRef}
        scrollable
        snapPoints={["92%"]}
        onDismiss={resetForm}
        footer={<Button label={expense ? "Save changes" : "Add expense"} loading={busy} onPress={save} />}
      >
        <AppText size="md" weight="black">{expense ? "Edit expense" : "Add expense"}</AppText>

        <AmountHeroInput value={amount} onChangeText={setAmount} />
        <Input placeholder="What was it? e.g. Dinner at the beach" value={title} onChangeText={setTitle} InputComponent={BottomSheetTextInput} />

        <View style={styles.pair}>
          <View style={styles.grow}><DateField label="WHEN" value={date} onChange={setDate} maximumDate={new Date()} /></View>
        </View>

        <PressableScale style={styles.selRow} onPress={() => categoryRef.current?.present()} scaleTo={0.98}>
          <Icon name={(categoryDoc?.icon ?? "category") as IconName} size={16} containerSize={32} containerRadius={10} container="square" gradient={(categoryDoc?.color ?? "accent") as ColorToken} />
          <View style={styles.grow}>
            <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>CATEGORY</AppText>
            <AppText size="sm" weight="semibold" color={categoryDoc ? "ink" : "inkDim"}>{categoryDoc?.name ?? "Choose a category"}</AppText>
          </View>
          <Icon name="chevronRight" size={20} color="inkDim" />
        </PressableScale>

        <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>WHO PAID</AppText>
        <View style={styles.avatars}>
          {everyone.map((w) => {
            const on = payer === w;
            return (
              <Pressable key={w} onPress={() => { haptics.tap(); setPayer(w); }} style={styles.avatarCol} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${nameOf(w)} paid`}>
                <View style={[styles.avatarRing, on && styles.avatarRingOn]}>
                  <Icon name="person" size={16} containerSize={40} containerRadius={20} container="square" gradient={tintFor(w)} />
                </View>
                <AppText size="xs" weight={on ? "bold" : "semibold"} color={on ? "ink" : "inkDim"} numberOfLines={1}>{w === ME ? "You" : nameOf(w)}</AppText>
              </Pressable>
            );
          })}
        </View>
        {payer === ME && (
          <PressableScale style={styles.selRow} onPress={() => accountRef.current?.present()} scaleTo={0.98}>
            <Icon name="wallet" size={18} color="inkDim" />
            <View style={styles.grow}>
              <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>PAID FROM</AppText>
              <AppText size="sm" weight="semibold">{fromAccount?.name ?? "Choose an account"}</AppText>
            </View>
            <Icon name="chevronRight" size={20} color="inkDim" />
          </PressableScale>
        )}

        <View style={styles.splitHead}>
          <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>SPLIT BETWEEN</AppText>
          <View style={styles.modes}>
            <Chip label="Equally" selected={mode === "equal"} onPress={() => setMode("equal")} />
            <Chip label="Custom" selected={mode === "custom"} onPress={() => {
              // Start custom from the even split, so it's an adjustment rather than a blank.
              const ins = everyone.filter((w) => inSplit.includes(w));
              const parts = splitEvenly(cost > 0 ? cost : 0, ins.length);
              setCustom(Object.fromEntries(ins.map((w, i) => [w, paiseToInput(parts[i])])));
              setMode("custom");
            }} />
          </View>
        </View>
        <View style={styles.card}>
          {everyone.map((w) => {
            const on = inSplit.includes(w);
            const share = shares.find((s) => s.who === w)?.amount ?? 0;
            return (
              <View key={w} style={styles.shareRow}>
                <Pressable onPress={() => toggleIn(w)} style={styles.shareLeft} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                  <View style={[styles.check, on && styles.checkOn]}>{on && <AppText size="xs" weight="black">✓</AppText>}</View>
                  <AppText size="sm" weight={on ? "bold" : "semibold"} color={on ? "ink" : "inkDim"}>{nameOf(w)}</AppText>
                </Pressable>
                {on && mode === "custom" ? (
                  <View style={styles.customBox}>
                    <Input value={custom[w] ?? ""} onChangeText={(v) => setCustom((c) => ({ ...c, [w]: v }))} placeholder="0" keyboardType="decimal-pad" InputComponent={BottomSheetTextInput} />
                  </View>
                ) : (
                  <AppText size="sm" weight={w === ME ? "black" : "semibold"} color={on ? (w === ME ? "ink" : "inkDim") : "inkDim"}>
                    {on ? formatMoney(share) : "—"}
                  </AppText>
                )}
              </View>
            );
          })}
        </View>
        {mode === "custom" && cost > 0 && assigned !== cost && (
          <AppText size="xs" weight="bold" color="warning">
            {assigned < cost ? `${formatMoney(cost - assigned)} still to assign` : `${formatMoney(assigned - cost)} too much`}
          </AppText>
        )}
        {effect && <AppText size="xs" color="inkDim" style={styles.center}>{effect}</AppText>}

        {error && <AppText size="sm" color="danger">{error}</AppText>}
        {expense && <Button label="Delete expense" variant="dangerGhost" icon="delete" onPress={() => deleteRef.current?.present()} />}
      </AppSheet>

      <CategoryPickerSheet ref={categoryRef} kind="expense" onPick={setCategory} />
      <AccountPickerSheet ref={accountRef} title="Paid from" selectedId={paidFrom} onPick={setPaidFrom} excludeTypes={["investment", "person"]} />
      <ConfirmSheet
        ref={deleteRef}
        icon="delete"
        title={`Delete ${expense?.title ?? "this expense"}?`}
        body="It comes off the trip, and every balance and account it touched goes back to how it was."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!expense) return;
          await deleteTripExpense(tripId, expense._id);
          innerRef.current?.dismiss();
          onSaved();
          toast.info(`${expense.title} deleted`);
        }}
      />
    </>
  );
});

TripExpenseSheet.displayName = "TripExpenseSheet";

const styles = StyleSheet.create({
  pair: { flexDirection: "row", gap: spacing.sm },
  grow: { flex: 1 },
  label: { letterSpacing: 1.3 },
  selRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.13)" },
  avatars: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  avatarCol: { alignItems: "center", gap: 4, width: 58 },
  avatarRing: { borderRadius: 24, padding: 2 },
  avatarRingOn: { borderWidth: 2, borderColor: colors.primary },
  splitHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modes: { flexDirection: "row", gap: spacing.xs },
  card: { borderRadius: 16, paddingHorizontal: 12, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  shareRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  shareLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 },
  check: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: "rgba(255,255,255,0.35)", alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  customBox: { width: 110 },
  center: { textAlign: "center" },
});

export default TripExpenseSheet;
