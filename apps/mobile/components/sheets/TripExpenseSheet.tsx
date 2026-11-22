import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import type { ITripExpense, TripMemberBalance } from "@save-n-spend/types";
import AppSheet from "./AppSheet";
import AccountPickerSheet from "./AccountPickerSheet";
import CategoryPickerSheet from "./CategoryPickerSheet";
import ConfirmSheet from "./ConfirmSheet";
import { AppText } from "@/components/ui/AppText";
import Caps from "@/components/ui/Caps";
import AmountHeroInput from "@/components/ui/AmountHeroInput";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import DateField from "@/components/ui/DateField";
import Icon from "@/components/ui/Icon";
import Input from "@/components/ui/Input";
import { useAccountById, useDefaultAccount } from "@/lib/accounts";
import { useCategoryById } from "@/lib/categories";
import { haptics } from "@/lib/haptics";
import formatMoney, { parseMoney, paiseToInput, usePrivacyMask } from "@/lib/money";
import { addTripExpense, reloadAfterTripRowsDelete, splitEvenly, updateTripExpense } from "@/lib/trips";
import { deleteTarget, deleteWithUndo, editWithUndo } from "@/lib/undo";
import { holderFor } from "@/lib/idempotency";
import { toast } from "@/store/toast";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { colors, spacing } from "@/theme";
import { useOnlineGate } from "@/lib/onlineGate";
import { splitIssues } from "@/lib/apiError";
import { useFormError } from "@/lib/useFormError";
import SheetFooter from "./SheetFooter";
import FieldError from "@/components/ui/FieldError";
import { tripExpenseFormSchema } from "@/lib/formSchemas";
import { useSchemaForm } from "@/lib/useSchemaForm";
import FieldRow from "@/components/ui/FieldRow";

type Props = {
  tripId: string;
  members: TripMemberBalance[];
  /** The expense being edited, or null to add one. */
  expense: ITripExpense | null;
  /** Where a new expense's date starts — inside the trip. */
  defaultDate: Date;
  /** Optional: the write already refreshes the trip. */
  onSaved?: () => void;
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
  // Needs the server: offline the button says so before the tap.
  const gate = useOnlineGate("");
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
  const { error, fail, clear: clearError } = useFormError();

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
    clearError();
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

  const schema = useMemo(() => tripExpenseFormSchema(formatMoney), []);
  const { fieldError, submit, setFieldError } = useSchemaForm(schema, {
    title, cost, shares: shares.map((s) => ({ amount: s.amount })), paidByMe: payer === ME, paidFrom: fromAccount?._id ?? null,
  });

  const save = () => submit(async () => {
    const draft = {
      title: title.trim(),
      occurredAt: date.toISOString(),
      category,
      cost,
      paidBy: payer === ME ? null : payer,
      paidFrom: payer === ME ? fromAccount?._id ?? null : null,
      shares: shares.map((s) => ({ account: s.who === ME ? null : s.who, amount: s.amount })),
    };
    setBusy(true);
    clearError();
    try {
      const idem = holderFor(`trip:${tripId}:expense:${expense?._id ?? "new"}`);
      let saved: { updatedAt?: string } | null = null;
      if (expense) {
        saved = await updateTripExpense(tripId, expense._id, draft, {
          idempotencyKey: idem.keyFor("PATCH", `/trips/${tripId}/expenses/${expense._id}`, draft),
        });
      }
      else await addTripExpense(tripId, draft, { idempotencyKey: idem.keyFor("POST", `/trips/${tripId}/expenses`, draft) });
      idem.reset();
      innerRef.current?.dismiss();
      onSaved?.();
      if (expense) {
        editWithUndo({
          path: `/trips/${tripId}/expenses/${expense._id}`,
          previous: {
            title: expense.title, occurredAt: expense.occurredAt, category: expense.category, cost: expense.cost,
            paidBy: expense.paidBy, paidFrom: expense.paidFrom, shares: expense.shares.map((s) => ({ account: s.account, amount: s.amount })),
          },
          saved,
          message: `${draft.title} updated`,
          reload: reloadAfterTripRowsDelete,
        });
      }
      else toast.success(`${draft.title} added · your share ${formatMoney(myShare)}`);
    }
    catch (err) {
      const { byField, rest } = splitIssues(err, { title: "title", cost: "cost", shares: "shares", paidFrom: "paidFrom" } as const, "Couldn't save it");
      for (const [field, message] of Object.entries(byField)) setFieldError(field, { message });
      fail(rest);
    }
    finally {
      setBusy(false);
    }
  });

  const tintFor = (w: Who) => (w === ME ? "teal" : AVATAR_TINTS[members.findIndex((m) => m.account === w) % AVATAR_TINTS.length]);

  return (
    <>
      <AppSheet
        ref={innerRef}
        scrollable
        snapPoints={["92%"]}
        onDismiss={resetForm}
        footer={<SheetFooter error={error}><Button label={expense ? "Save changes" : "Add expense"} icon={gate.icon} hint={gate.hint} loading={busy} disabled={!gate.allowed} onPress={save} /></SheetFooter>}
      >
        <AppText size="md" weight="black">{expense ? "Edit expense" : "Add expense"}</AppText>

        <AmountHeroInput value={amount} onChangeText={setAmount} />
        <FieldError message={fieldError("cost")} />
        <Input placeholder="What was it? e.g. Dinner at the beach" value={title} onChangeText={setTitle} InputComponent={BottomSheetTextInput} error={fieldError("title")} />

        <View style={styles.pair}>
          <View style={styles.grow}><DateField label="When" value={date} onChange={setDate} maximumDate={new Date()} /></View>
        </View>

        <FieldRow
          label="Category"
          value={categoryDoc?.name}
          placeholder="Choose a category"
          chip={{ icon: (categoryDoc?.icon ?? "category") as IconName, gradient: (categoryDoc?.color ?? "accent") as ColorToken }}
          onPress={() => categoryRef.current?.present()}
          accessibilityHint="Picks the category"
        />

        <Caps>Who paid</Caps>
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
          <FieldRow
            label="Paid from"
            value={fromAccount?.name}
            placeholder="Choose an account"
            icon="wallet"
            onPress={() => accountRef.current?.present()}
            accessibilityHint="Picks the account"
            error={fieldError("paidFrom")}
          />
        )}

        <View style={styles.splitHead}>
          <Caps>Split between</Caps>
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
                <Pressable onPress={() => toggleIn(w)} style={styles.shareLeft} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`Split with ${nameOf(w)}`}>
                  <View style={[styles.check, on && styles.checkOn]}>{on && <AppText size="xs" weight="black">✓</AppText>}</View>
                  <AppText size="sm" weight={on ? "bold" : "semibold"} color={on ? "ink" : "inkDim"}>{nameOf(w)}</AppText>
                </Pressable>
                {on && mode === "custom" ? (
                  <View style={styles.customBox}>
                    <Input accessibilityLabel={`${nameOf(w)}'s share`} value={custom[w] ?? ""} onChangeText={(v) => setCustom((c) => ({ ...c, [w]: v }))} placeholder="0" keyboardType="decimal-pad" InputComponent={BottomSheetTextInput} />
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
        {fieldError("shares") ? (
          <FieldError message={fieldError("shares")} />
        ) : mode === "custom" && cost > 0 && assigned !== cost && (
          <AppText size="xs" weight="bold" color="warning">
            {assigned < cost ? `${formatMoney(cost - assigned)} still to assign` : `${formatMoney(assigned - cost)} too much`}
          </AppText>
        )}
        {effect && <AppText size="xs" color="inkDim" style={styles.center}>{effect}</AppText>}

        {expense && <Button label="Delete expense" variant="dangerGhost" icon={gate.icon ?? "delete"} hint={gate.hint} disabled={!gate.allowed} onPress={() => deleteRef.current?.present()} />}
      </AppSheet>

      <CategoryPickerSheet ref={categoryRef} kind="expense" onPick={setCategory} />
      <AccountPickerSheet ref={accountRef} title="Paid from" selectedId={paidFrom} onPick={setPaidFrom} excludeTypes={["investment", "person"]} />
      <ConfirmSheet
        ref={deleteRef}
        icon="delete"
        title={`Delete ${expense?.title ?? "this expense"}?`}
        body="It comes off the trip, and every balance and account it touched goes back to how it was."
        confirmLabel="Delete"
        needsConnection
        onConfirm={() => {
          if (!expense) return;
          innerRef.current?.dismiss();
          deleteWithUndo({
            ...deleteTarget.tripExpense(tripId, expense._id),
            label: expense.title,
            message: `${expense.title} deleted`,
            reload: reloadAfterTripRowsDelete,
            onCommitted: onSaved,
          });
        }}
      />
    </>
  );
});

TripExpenseSheet.displayName = "TripExpenseSheet";

const styles = StyleSheet.create({
  pair: { flexDirection: "row", gap: spacing.sm },
  grow: { flex: 1 },
  avatars: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  avatarCol: { alignItems: "center", gap: 4, width: 58 },
  avatarRing: { borderRadius: 24, padding: 2 },
  avatarRingOn: { borderWidth: 2, borderColor: colors.primary },
  splitHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modes: { flexDirection: "row", gap: spacing.xs },
  card: { borderRadius: 16, paddingHorizontal: 12, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: colors.line },
  shareRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.surface2 },
  shareLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 },
  check: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: "rgba(255,255,255,0.35)", alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  customBox: { width: 110 },
  center: { textAlign: "center" },
});

export default TripExpenseSheet;
