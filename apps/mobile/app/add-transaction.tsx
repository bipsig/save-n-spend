import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import BackButton from "@/components/shell/BackButton";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import CategoryName from "@/components/ui/CategoryName";
import DateField from "@/components/ui/DateField";
import { haptics } from "@/lib/haptics";
import { toast } from "@/store/toast";
import { z } from "zod/v4";
import formatMoney, { paiseToInput, parseMoney, usePrivacyMask } from "@/lib/money";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useCategories, useCategoryById } from "@/lib/categories";
import SegmentedControl from "@/components/ui/SegmentedControl";
import CategoryPickerSheet from "@/components/sheets/CategoryPickerSheet";
import type { IconName } from "@/lib/icons";
import { spacing } from "@/theme";
import type { ColorToken } from "@/theme";
import { accountById, useAccountById, useAccounts, useDefaultAccount } from "@/lib/accounts";
import AccountPickerSheet from "@/components/sheets/AccountPickerSheet";
import { get, patch, post } from "@/lib/api";
import { useAccountStore } from "@/store/accounts";
import type { ITransaction } from "@save-n-spend/types";

const schema = z.object({
  title: z.string(),
  amount: z
    .string()
    .regex(/^\s*₹?\s*[\d,]+(\.\d{1,2})?\s*$/, "Enter a valid amount")
    .refine((v) => parseMoney(v) > 0, "Enter a valid amount"),
  type: z.enum(["income", "expense", "transfer"]),
  // The picker only renders real categories (kind-filtered), so a non-empty
  // selection is a valid one; the server is the source of truth on save.
  category: z.string(),
  note: z.string(),
  location: z.string(),
}).superRefine((data, ctx) => {
  // A transfer moves money between accounts — it has no title or category.
  // Spends (income/expense) require both.
  if (data.type !== "transfer") {
    if (data.title.trim().length === 0) {
      ctx.addIssue({ code: "custom", path: ["title"], message: "Title is required" });
    }
    if (data.category.length === 0) {
      ctx.addIssue({ code: "custom", path: ["category"], message: "Select a category" });
    }
  }
});

type FormValues = z.infer<typeof schema>

// Indian digit grouping for the hero display: last 3, then pairs (12,34,567).
const groupINR = (digits: string): string => {
  if (digits.length <= 3) return digits;
  const parts: string[] = [digits.slice(-3)];
  let rest = digits.slice(0, -3);
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return parts.join(",");
};

const formatAmountDisplay = (raw: string): string => {
  if (!raw) return "0";
  const [int = "", dec] = raw.split(".");
  const grouped = groupINR(int) || "0";
  return dec !== undefined ? `${grouped}.${dec}` : grouped;
};

// Spec numpad — digits stream straight into the hero figure; no boxed input.
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;

const TYPE_SEGMENTS: { key: FormValues["type"]; label: string }[] = [
  { key: "expense", label: "Expense" },
  { key: "income", label: "Income" },
  { key: "transfer", label: "Transfer" },
];

const AddTransaction = () => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below
  const router = useRouter();
  const { id, repeatId, settleAccount } = useLocalSearchParams<{ id?: string; repeatId?: string; settleAccount?: string }>();
  const isEdit = !!id;

  const categories = useCategories();
  const { control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", amount: "", category: "", type: "expense", note: "", location: "" }
  })

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [occurredAt, setOccurredAt] = useState<Date>(new Date());
  const [extrasOpen, setExtrasOpen] = useState(false);

  // Shared by editing a transaction and repeating one — everything is the same except
  // which moment it lands on: the original's own timestamp for an edit, right now for a
  // repeat. That's the one thing callers pass in.
  const applyTransactionToForm = (transaction: ITransaction, landOn: Date) => {
    reset({
      title: transaction.title ?? "",
      amount: paiseToInput(transaction.amount),
      type: transaction.type as FormValues["type"],
      category: transaction.category ?? "",
      note: transaction.note ?? "",
      location: transaction.location ?? "",
    });
    setOccurredAt(landOn);
    setAccountId(transaction.account ?? null);
    setToAccountId(transaction.toAccount ?? null);
    if (transaction.note || transaction.location) setExtrasOpen(true);
  };

  useEffect(() => {
    if (!id) {
      return;
    }

    (async () => {
      try {
        const transaction = await get<ITransaction>(`/transactions/${id}`);
        applyTransactionToForm(transaction, transaction.occurredAt ? new Date(transaction.occurredAt) : new Date());
      }
      catch (err) {
        // Buzzes even though nothing was pressed: the form is showing blank defaults for
        // a transaction the user opened to edit, and saving would overwrite real data.
        haptics.error();
        setSubmitError(err instanceof Error ? err.message : "Couldn't load transaction");
      }
    })();
  }, [id, reset])

  // "Log again today" from the detail sheet — the same load as editing, except it lands on
  // now rather than the original's moment, and `isEdit` stays false (keyed to `id` alone) so
  // the form opens fully editable rather than locked the way an edit is.
  useEffect(() => {
    if (!repeatId) {
      return;
    }

    (async () => {
      try {
        const transaction = await get<ITransaction>(`/transactions/${repeatId}`);
        applyTransactionToForm(transaction, new Date());
      }
      catch (err) {
        haptics.error();
        setSubmitError(err instanceof Error ? err.message : "Couldn't load that transaction");
      }
    })();
  }, [repeatId, reset])

  // Spec: the CTA label is live — it names what you're saving.
  const type = watch("type");
  const amountRaw = watch("amount");

  // Category — picked via the shared sheet (search + create on the fly), same as Bills/Budgets.
  const categoryRef = useRef<BottomSheetModal>(null);
  const selectedCategory = useCategoryById(watch("category"));

  // Source account (from) — defaults to the user's default, switchable via the picker.
  const accountRef = useRef<BottomSheetModal>(null);
  const defaultAccount = useDefaultAccount();
  const [accountId, setAccountId] = useState<string | null>(null);
  useEffect(() => {
    if (!accountId && defaultAccount) setAccountId(defaultAccount._id);
  }, [defaultAccount, accountId]);
  const account = useAccountById(accountId) ?? defaultAccount;

  // Destination account (transfer only) — must be picked, and different from the source.
  const toAccountRef = useRef<BottomSheetModal>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const toAccount = useAccountById(toAccountId);

  // "Settle up" from a person account's sheet — a transfer prefilled in whichever direction
  // clears the balance, amount included. Nothing is locked: the real repayment can differ
  // slightly (rounding, a partial settlement), so every field stays editable.
  useEffect(() => {
    if (!settleAccount) {
      return;
    }
    const person = accountById(settleAccount);
    if (!person) {
      return;
    }
    const owesYou = person.balance > 0;
    setValue("type", "transfer");
    setAccountId(owesYou ? person._id : (defaultAccount?._id ?? null));
    setToAccountId(owesYou ? (defaultAccount?._id ?? null) : person._id);
    setValue("amount", paiseToInput(Math.abs(person.balance)));
  }, [settleAccount, setValue, defaultAccount])

  // For the split rows below: `useAccountById` is a hook and can't be called once per row
  // in a `.map`, so the whole list is subscribed once here and each row does a plain lookup.
  const allAccounts = useAccounts();

  // Split — expense only, new entries only (an edit can't reconcile a group's transfers).
  // Each row picks a person and what they owe; the rest of the total stays the user's own
  // share. `key` is local-only, for React's list identity — it never reaches the server.
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitRows, setSplitRows] = useState<{ key: string; accountId: string | null; amount: string }[]>([]);
  const nextRowKey = useRef(0);
  const [activeSplitKey, setActiveSplitKey] = useState<string | null>(null);
  const splitAccountRef = useRef<BottomSheetModal>(null);

  const addSplitRow = () => {
    if (splitRows.length >= 10) return; // matches the API's per-split cap
    setSplitRows((rows) => [...rows, { key: String(nextRowKey.current++), accountId: null, amount: "" }]);
  };

  const toggleSplit = () => {
    setSplitOpen((open) => {
      const next = !open;
      if (next && splitRows.length === 0) addSplitRow();
      return next;
    });
  };

  const removeSplitRow = (key: string) => {
    haptics.tap();
    setSplitRows((rows) => rows.filter((r) => r.key !== key));
  };

  const setSplitAmount = (key: string, amount: string) =>
    setSplitRows((rows) => rows.map((r) => (r.key === key ? { ...r, amount } : r)));

  // Only rows with a person picked count — an empty row is a slot still being filled in.
  const splitFilledRows = splitOpen ? splitRows.filter((r) => r.accountId) : [];
  const owedTotal = splitFilledRows.reduce((sum, r) => {
    const rowAmount = parseMoney(r.amount);
    return sum + (Number.isFinite(rowAmount) && rowAmount > 0 ? rowAmount : 0);
  }, 0);

  const splitEqually = () => {
    if (splitFilledRows.length === 0 || !(entered > 0)) return;
    haptics.toggle();
    // Rounds down; the remainder stays in the user's own share rather than vanishing —
    // see the share computation in onSubmit, which is `entered` minus this same sum.
    const perPerson = Math.floor(entered / (splitFilledRows.length + 1));
    const perPersonInput = paiseToInput(perPerson);
    setSplitRows((rows) => rows.map((r) => (r.accountId ? { ...r, amount: perPersonInput } : r)));
  };

  const entered = parseMoney(amountRaw);
  const balanceLine = useMemo(() => {
    if (isEdit || !account) return null;
    if (type === "transfer") {
      const dest = toAccount ? ` → ${toAccount.name}` : "";
      return entered > 0
        ? `From ${account.name}${dest} · ${formatMoney(account.balance - entered)} left after this`
        : `From ${account.name}${dest} · ${formatMoney(account.balance)} available`;
    }
    if (!(entered > 0)) {
      return `From ${account.name} · ${formatMoney(account.balance)} available`;
    }
    if (type === "expense" && owedTotal > 0) {
      const share = Math.max(entered - owedTotal, 0);
      return `From ${account.name} · your share ${formatMoney(share)} · ${formatMoney(owedTotal)} owed to you`;
    }
    const after = type === "income" ? account.balance + entered : account.balance - entered;
    return `${type === "income" ? "To" : "From"} ${account.name} · ${formatMoney(after)} ${type === "income" ? "after this" : "left after this"}`;
  }, [account, toAccount, entered, type, isEdit, owedTotal]);

  const setAmount = (next: string) =>
    setValue("amount", next, { shouldValidate: true });

  // The category row is kind-filtered; switching type drops a selection
  // that no longer belongs (an income can't keep a Food category).
  // Edit mode: type is immutable — the segment ignores taps.
  const switchType = (next: FormValues["type"]) => {
    if (isEdit) return;
    setValue("type", next);
    const selected = categories.find((c) => c._id === watch("category"));
    if (selected && selected.kind !== next) {
      setValue("category", "");
    }
    // A split belongs to the expense it was built for — carrying it to Income or
    // Transfer would leave stale person rows behind a section that's no longer shown.
    if (next !== "expense") {
      setSplitOpen(false);
      setSplitRows([]);
    }
  };

  // The tick fires only where the figure changed. A key the rules reject — a second
  // decimal point, a third decimal place, the ceiling, backspace on empty — stays silent,
  // so the absence of a tap is the answer.
  const pressKey = (key: (typeof KEYS)[number]) => {
    const cur = amountRaw ?? "";
    if (key === "back") {
      if (cur === "") return;
      haptics.tap();
      setAmount(cur.slice(0, -1));
      return;
    }
    if (key === ".") {
      if (cur.includes(".")) return;
      haptics.tap();
      setAmount(cur === "" ? "0." : cur + ".");
      return;
    }
    const dot = cur.indexOf(".");
    if (dot !== -1 && cur.length - dot > 2) return; // max 2 decimals
    if (cur.replace(".", "").length >= 9) return; // sane upper bound
    haptics.tap();
    setAmount(cur === "0" ? key : cur + key); // a lone leading zero is replaced, not appended
  };

  // The account checks RHF can't do in the resolver. Each buzzes: the message lands at the
  // bottom of a long form and the row it's about may be scrolled out of sight.
  const reject = (message: string) => {
    haptics.error();
    setSubmitError(message);
  };

  const onSubmit = async (data: FormValues) => {
    if (!account) {
      reject("Account is missing");
      return;
    }
    // Transfer needs a distinct destination; RHF can't validate account state.
    if (data.type === "transfer") {
      if (!toAccount) {
        reject("Choose the destination account");
        return;
      }
      if (toAccount._id === account._id) {
        reject("Pick two different accounts");
        return;
      }
    }

    // Only send note / location when they carry a value (backend fields are optional).
    const extras = {
      ...(data.note.trim() ? { note: data.note.trim() } : {}),
      ...(data.location.trim() ? { location: data.location.trim() } : {}),
    };

    // A split: `owedBy` becomes one transfer per person, and the expense itself is
    // pared down to the user's own share — see createTransaction on the API.
    let owedBy: { account: string; amount: number }[] | undefined;
    if (!isEdit && data.type === "expense" && splitFilledRows.length > 0) {
      for (const row of splitFilledRows) {
        const rowAmount = parseMoney(row.amount);
        if (!(rowAmount > 0)) {
          reject("Enter what each person owes");
          return;
        }
      }
      const total = splitFilledRows.reduce((sum, row) => sum + parseMoney(row.amount), 0);
      if (total >= entered) {
        reject("Your share must be more than ₹0 — lower what's owed");
        return;
      }
      owedBy = splitFilledRows.map((row) => ({ account: row.accountId!, amount: parseMoney(row.amount) }));
    }
    const share = owedBy ? entered - owedBy.reduce((sum, row) => sum + row.amount, 0) : parseMoney(data.amount);

    // A spend carries title + category; a transfer carries toAccount and neither. Amount
    // is positive paise; `type` gives the direction.
    const payload = data.type === "transfer"
      ? { type: data.type, amount: parseMoney(data.amount), account: account._id, toAccount: toAccount!._id, occurredAt: occurredAt.toISOString(), ...extras }
      : {
          type: data.type,
          amount: share,
          account: account._id,
          category: data.category,
          title: data.title,
          occurredAt: occurredAt.toISOString(),
          ...(owedBy ? { owedBy } : {}),
          ...extras,
        };

    setSubmitting(true);
    setSubmitError(null);
    try {
      if (isEdit) {
        // Account moves are deferred in edit; patch only the editable fields per type.
        const editPayload = data.type === "transfer"
          ? { amount: parseMoney(data.amount), occurredAt: occurredAt.toISOString(), ...extras }
          : { title: data.title, amount: parseMoney(data.amount), category: data.category, occurredAt: occurredAt.toISOString(), ...extras };
        await patch(`/transactions/${id}`, editPayload);
      }
      else {
        await post("/transactions", payload);
      }
      // Every save here moves a balance — a plain edit's amount, a split's transfers, an
      // ordinary expense's account. The list held elsewhere (Net Worth, the account
      // picker) is stale until this reloads it.
      await useAccountStore.getState().load();
      router.back();
      // The screen is already gone by the time this shows, so it is the only receipt —
      // hence naming the amount and direction rather than just "Saved".
      const amount = formatMoney(parseMoney(data.amount));
      if (isEdit) toast.success(`Changes saved — ${amount}`);
      else if (data.type === "transfer") toast.success(`${amount} moved to ${toAccount!.name}`);
      else if (data.type === "income") toast.success(`${amount} added to ${account.name}`);
      else if (owedBy) {
        const owedTotalSaved = owedBy.reduce((sum, row) => sum + row.amount, 0);
        toast.success(`${amount} spent on ${data.title.trim()} — ${formatMoney(owedTotalSaved)} owed to you`);
      }
      else toast.success(`${amount} spent on ${data.title.trim()}`);
    }
    catch (err) {
      // On the screen rather than toasted — everything the user typed is still in the
      // fields, and the reason has to be readable next to it.
      reject(err instanceof Error ? err.message : "Error creating new transaction");
    }
    finally {
      setSubmitting(false);
    }
  }

  // Spec .shead — ✕ on the left, centered title, balancing spacer on the right.
  const header = (
    <View style={styles.header}>
      {/* The shared ✕, so this route squeezes and ticks like every other modal. */}
      <BackButton variant="close" />
      <AppText weight="black" size="lg">
        {isEdit ? "Edit Transaction" : "Add Transaction"}
      </AppText>
      <View style={styles.headerSpacer} />
    </View>
  );

  return (
    // A native modal route hosts its own portal — without this, gorhom sheets render
    // behind the modal and read as unclickable.
    <BottomSheetModalProvider>
    <ScreenScaffold header={header} scroll={false}>
      <View style={styles.body}>
        {/* Type — Expense / Income / Transfer. Immutable in edit mode. */}
        <View pointerEvents={isEdit ? "none" : "auto"} style={isEdit ? styles.segRowLocked : undefined}>
          <SegmentedControl segments={TYPE_SEGMENTS} value={type} onChange={switchType} />
        </View>

        {/* Amount hero — spec .heroamt: numpad digits stream straight in */}
        <View style={styles.heroAmt}>
          <View style={styles.heroRow}>
            <AppText size="lg" weight="bold" color="inkDim" style={styles.heroCur}>
              ₹
            </AppText>
            <AppText weight="black" style={styles.heroVal}>
              {formatAmountDisplay(amountRaw)}
            </AppText>
            <View style={styles.caret} />
          </View>
          {balanceLine && (
            <AppText size="xs" color="inkDim">
              {balanceLine}
            </AppText>
          )}
          {errors.amount && amountRaw !== "" && (
            <AppText size="xs" color="danger">
              {errors.amount.message}
            </AppText>
          )}
        </View>

        {/* Scrollable middle — title, category, account, date, note */}
        <ScrollView
          style={styles.midScroll}
          contentContainerStyle={styles.midContent}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          {/* Switching type rebuilds this list — a transfer has no title or category, and
              gains a destination. The fades keep that from reading as a glitch. */}
          {type !== "transfer" && (
            <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
              <Controller
                control={control}
                name="title"
                render={({ field: { value, onChange, onBlur } }) => (
                  <Input
                    placeholder="e.g. Groceries at BigBasket"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.title?.message}
                  />
                )}
              />
            </Animated.View>
          )}

          {/* The shared tiered picker, same as Bills / Budgets. Hidden for transfers. */}
          {type !== "transfer" && (
            <Animated.View
              entering={FadeIn.duration(180)}
              exiting={FadeOut.duration(120)}
              style={styles.field}
            >
              <PressableScale style={styles.selRow} onPress={() => categoryRef.current?.present()} scaleTo={0.98}>
                <Icon
                  name={(selectedCategory?.icon ?? "add") as IconName}
                  size={17}
                  containerSize={34}
                  containerRadius={11}
                  container="square"
                  gradient={(selectedCategory?.color ?? "accent") as ColorToken}
                />
                <View style={styles.selText}>
                  <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>CATEGORY</AppText>
                  {/* Inline breadcrumb: the row already has a label, so the parent shares
                      the value line — "Fuel" has to show it lands in Transportation. */}
                  <CategoryName
                    categoryId={watch("category")}
                    size="sm"
                    weight="semibold"
                    inline
                    placeholder="Choose a category"
                  />
                </View>
                <Icon name="chevronRight" size={20} color="inkDim" />
              </PressableScale>
              {errors.category && (
                <AppText size="xs" color="danger">{errors.category.message}</AppText>
              )}
            </Animated.View>
          )}

          {/* A spend picks one source; a transfer picks source → destination. Not editable
              in edit mode — it would need cross-account balance reconciliation. */}
          {!isEdit && type !== "transfer" && (
            <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
              <PressableScale style={styles.selRow} onPress={() => accountRef.current?.present()} scaleTo={0.98}>
                <Icon name="wallet" size={18} color="inkDim" />
                <AppText size="sm" weight="bold" style={styles.selValue}>
                  {account?.name ?? "Select account"}
                </AppText>
                <Icon name="chevronRight" size={20} color="inkDim" />
              </PressableScale>
            </Animated.View>
          )}

          {/* Split — only a fresh expense can start one; editing one row of an existing
              split is still possible below in Activity, just not from here. */}
          {!isEdit && type === "expense" && (
            <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.stack}>
              <PressableScale style={[styles.selRow, !splitOpen && styles.selRowDim]} onPress={toggleSplit} scaleTo={0.98}>
                <Icon name="person" size={18} color="inkDim" />
                <AppText size="sm" weight="semibold" color={splitOpen ? "ink" : "inkDim"} style={styles.selValue}>
                  {owedTotal > 0 ? `Split · ${formatMoney(owedTotal)} owed to you` : "Split with people"}
                </AppText>
                <Icon name={splitOpen ? "chevronDown" : "chevronRight"} size={20} color="inkDim" />
              </PressableScale>

              {splitOpen && (
                <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} style={styles.stack}>
                  {splitRows.map((row) => {
                    const person = allAccounts.find((a) => a._id === row.accountId);
                    return (
                      <View key={row.key} style={styles.splitRow}>
                        <PressableScale
                          style={styles.splitPerson}
                          scaleTo={0.98}
                          onPress={() => {
                            setActiveSplitKey(row.key);
                            splitAccountRef.current?.present();
                          }}
                        >
                          <Icon name={(person?.icon ?? "person") as IconName} size={16} color="inkDim" />
                          <AppText size="sm" weight="bold" color={person ? "ink" : "inkDim"} style={styles.selValue}>
                            {person?.name ?? "Choose person"}
                          </AppText>
                        </PressableScale>
                        <View style={styles.splitAmount}>
                          <AppText size="sm" color="inkDim">₹</AppText>
                          <Input
                            value={row.amount}
                            onChangeText={(v) => setSplitAmount(row.key, v)}
                            placeholder="0"
                            keyboardType="decimal-pad"
                            editable={!!row.accountId}
                            style={styles.splitAmountInput}
                          />
                        </View>
                        <PressableScale style={styles.splitRemove} onPress={() => removeSplitRow(row.key)} scaleTo={0.9}>
                          <Icon name="close" size={16} color="inkDim" />
                        </PressableScale>
                      </View>
                    );
                  })}

                  <View style={styles.splitActions}>
                    <PressableScale onPress={addSplitRow} scaleTo={0.98} disabled={splitRows.length >= 10}>
                      <AppText size="sm" weight="bold" color="primary">+ Add person</AppText>
                    </PressableScale>
                    {splitFilledRows.length > 0 && (
                      <PressableScale onPress={splitEqually} scaleTo={0.98}>
                        <AppText size="sm" weight="bold" color="primary">Split equally</AppText>
                      </PressableScale>
                    )}
                  </View>
                </Animated.View>
              )}
            </Animated.View>
          )}

          {!isEdit && type === "transfer" && (
            <Animated.View
              entering={FadeIn.duration(180)}
              exiting={FadeOut.duration(120)}
              style={styles.stack}
            >
              <PressableScale style={styles.selRow} onPress={() => accountRef.current?.present()} scaleTo={0.98}>
                <Icon name="wallet" size={18} color="inkDim" />
                <View style={styles.selText}>
                  <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>FROM</AppText>
                  <AppText size="sm" weight="bold">{account?.name ?? "Select account"}</AppText>
                </View>
                <Icon name="chevronRight" size={20} color="inkDim" />
              </PressableScale>

              <PressableScale style={styles.selRow} onPress={() => toAccountRef.current?.present()} scaleTo={0.98}>
                <Icon name="activity" size={18} color="inkDim" />
                <View style={styles.selText}>
                  <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>TO</AppText>
                  <AppText size="sm" weight="bold" color={toAccount ? "ink" : "inkDim"}>
                    {toAccount?.name ?? "Select destination"}
                  </AppText>
                </View>
                <Icon name="chevronRight" size={20} color="inkDim" />
              </PressableScale>
            </Animated.View>
          )}

          {/* Date + time row — defaults to now; tap to set when it actually happened. */}
          <DateField label="WHEN" mode="datetime" value={occurredAt} onChange={setOccurredAt} maximumDate={new Date()} />

          {/* Progressive disclosure — tap to reveal note + location fields. */}
          <PressableScale
            style={[styles.selRow, !extrasOpen && styles.selRowDim]}
            onPress={() => setExtrasOpen((open) => !open)}
            scaleTo={0.98}
          >
            <Icon name="add" size={18} color="inkDim" />
            <AppText size="sm" weight="semibold" color={extrasOpen ? "ink" : "inkDim"} style={styles.selValue}>
              {extrasOpen ? "Note & location" : "Add note · location"}
            </AppText>
            <Icon name={extrasOpen ? "chevronDown" : "chevronRight"} size={20} color="inkDim" />
          </PressableScale>

          {extrasOpen && (
            // Fades in, so the two fields read as revealed by the row above rather than
            // as a jump.
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(120)}
              style={styles.stack}
            >
              <Controller
                control={control}
                name="note"
                render={({ field: { value, onChange, onBlur } }) => (
                  <Input
                    label="Note"
                    placeholder="Add a note"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    multiline
                  />
                )}
              />
              <Controller
                control={control}
                name="location"
                render={({ field: { value, onChange, onBlur } }) => (
                  <Input
                    label="Location"
                    placeholder="e.g. Connaught Place"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                  />
                )}
              />
            </Animated.View>
          )}
        </ScrollView>

        {/* Fixed bottom — numpad + save, always visible with the amount above */}
        {submitError && (
          <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
            <AppText size="xs" color="danger">
              {submitError}
            </AppText>
          </Animated.View>
        )}

        <View style={styles.numpad}>
          {KEYS.map((key) => (
            // A plain Pressable, not PressableScale: a keypad is pressed fast, and a
            // spring still settling when the next digit lands reads as lag. The instant
            // background lift is the affordance instead.
            <Pressable
              key={key}
              onPress={() => pressKey(key)}
              style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
              accessibilityLabel={key === "back" ? "Delete digit" : key}
            >
              {key === "back" ? (
                <Icon name="backspace" size={20} color="inkDim" />
              ) : (
                <AppText size="lg" weight="bold" color={key === "." ? "inkDim" : "ink"}>
                  {key === "." ? "·" : key}
                </AppText>
              )}
            </Pressable>
          ))}
        </View>

        <Button
          onPress={handleSubmit(onSubmit)}
          loading={submitting}
          label={
            isEdit ? "Save Changes"
            : type === "income" ? "Save Income"
            : type === "transfer" ? (entered > 0 ? `Transfer ${formatMoney(entered)}` : "Transfer")
            : "Save Expense"
          }
        />
      </View>

      <AccountPickerSheet ref={accountRef} selectedId={accountId} onPick={setAccountId} />
      <AccountPickerSheet ref={toAccountRef} selectedId={toAccountId} onPick={setToAccountId} />
      {/* One sheet shared by every split row — `activeSplitKey` says which row it's for. */}
      <AccountPickerSheet
        ref={splitAccountRef}
        title="Who owes you"
        selectedId={splitRows.find((r) => r.key === activeSplitKey)?.accountId}
        filterType="person"
        allowCreate
        onPick={(pickedId) => {
          if (activeSplitKey) setSplitRows((rows) => rows.map((r) => (r.key === activeSplitKey ? { ...r, accountId: pickedId } : r)));
        }}
      />
      <CategoryPickerSheet
        ref={categoryRef}
        kind={type === "income" ? "income" : "expense"}
        onPick={(categoryId) => setValue("category", categoryId, { shouldValidate: true })}
      />
    </ScreenScaffold>
    </BottomSheetModalProvider>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerSpacer: {
    width: 32, // balances the ✕ so the title sits centered
  },
  // Fixed top / scrollable middle / fixed bottom, so the amount hero and the numpad stay
  // on screen together whatever the middle fields do.
  body: {
    flex: 1,
    gap: spacing.md,
  },
  midScroll: {
    flex: 1,
  },
  midContent: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  field: {
    gap: spacing.sm,
  },
  // A fading block holding more than one row has to carry the gap the scroll container
  // would have given those rows directly.
  stack: {
    gap: spacing.lg,
  },
  fieldLabel: {
    letterSpacing: 1.3, // spec .flabel
  },
  splitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  splitPerson: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  splitAmount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    width: 92,
  },
  splitAmountInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  splitRemove: {
    padding: 8,
  },
  splitActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  // Edit mode — the immutable type segment reads as inert, not interactive
  segRowLocked: {
    opacity: 0.55,
  },
  heroAmt: {
    alignItems: "center",
    gap: 6,
    paddingVertical: spacing.sm,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  heroCur: {
    marginRight: 3,
    marginBottom: 14, // superscript ₹, like the spec
  },
  heroVal: {
    fontSize: 46, // spec .heroamt .val 38px × device scale
    letterSpacing: -1.4,
  },
  caret: {
    width: 3,
    height: 34,
    borderRadius: 2,
    marginLeft: 5,
    backgroundColor: "#A394FF",
    shadowColor: "#A394FF",
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  // Spec .selrow — glass strip with icon · value · chevron
  selRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
  },
  selRowDim: {
    opacity: 0.75,
  },
  selValue: {
    flex: 1,
  },
  selText: {
    flex: 1,
    gap: 2,
  },
  numpad: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9, // spec .numpad gap × device scale
  },
  key: {
    flexGrow: 1,
    flexBasis: "30%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  keyPressed: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
});

export default AddTransaction;
