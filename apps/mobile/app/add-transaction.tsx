import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import DateField from "@/components/ui/DateField";
import { z } from "zod/v4";
import formatMoney, { paiseToInput, parseMoney } from "@/lib/money";
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
import { useAccountById, useDefaultAccount } from "@/lib/accounts";
import AccountPickerSheet from "@/components/sheets/AccountPickerSheet";
import { get, patch, post } from "@/lib/api";
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
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
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

  useEffect(() => {
    if (!id) {
      return;
    }

    (async () => {
      try {
        const transaction = await get<ITransaction>(`/transactions/${id}`);
        reset({
          title: transaction.title ?? "",
          amount: paiseToInput(transaction.amount),
          type: transaction.type as FormValues["type"],
          category: transaction.category ?? "",
          note: transaction.note ?? "",
          location: transaction.location ?? "",
        });
        setOccurredAt(transaction.occurredAt ? new Date(transaction.occurredAt) : new Date());
        setAccountId(transaction.account ?? null);
        setToAccountId(transaction.toAccount ?? null);
        if (transaction.note || transaction.location) setExtrasOpen(true);
      }
      catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Couldn't load transaction");
      }
    })();
  }, [id, reset])

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
    const after = type === "income" ? account.balance + entered : account.balance - entered;
    return `${type === "income" ? "To" : "From"} ${account.name} · ${formatMoney(after)} ${type === "income" ? "after this" : "left after this"}`;
  }, [account, toAccount, entered, type, isEdit]);

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
  };

  const pressKey = (key: (typeof KEYS)[number]) => {
    const cur = amountRaw ?? "";
    if (key === "back") {
      setAmount(cur.slice(0, -1));
      return;
    }
    if (key === ".") {
      if (cur.includes(".")) return;
      setAmount(cur === "" ? "0." : cur + ".");
      return;
    }
    const dot = cur.indexOf(".");
    if (dot !== -1 && cur.length - dot > 2) return; // max 2 decimals
    if (cur === "0") {
      setAmount(key); // replace a lone leading zero
      return;
    }
    if (cur.replace(".", "").length >= 9) return; // sane upper bound
    setAmount(cur + key);
  };

  const onSubmit = async (data: FormValues) => {
    if (!account) {
      setSubmitError("Account is missing");
      return;
    }
    // Transfer needs a distinct destination; RHF can't validate account state.
    if (data.type === "transfer") {
      if (!toAccount) {
        setSubmitError("Choose the destination account");
        return;
      }
      if (toAccount._id === account._id) {
        setSubmitError("Pick two different accounts");
        return;
      }
    }

    // Only send note / location when they carry a value (backend fields are optional).
    const extras = {
      ...(data.note.trim() ? { note: data.note.trim() } : {}),
      ...(data.location.trim() ? { location: data.location.trim() } : {}),
    };

    // Shaped to the server contract: a spend carries title + category; a transfer
    // carries toAccount and neither. Amount is positive paise; `type` gives direction.
    const payload = data.type === "transfer"
      ? { type: data.type, amount: parseMoney(data.amount), account: account._id, toAccount: toAccount!._id, occurredAt: occurredAt.toISOString(), ...extras }
      : { type: data.type, amount: parseMoney(data.amount), account: account._id, category: data.category, title: data.title, occurredAt: occurredAt.toISOString(), ...extras };

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
      router.back();
    }
    catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Error creating new transaction");
    }
    finally {
      setSubmitting(false);
    }
  }

  // Spec .shead — ✕ on the left, centered title, balancing spacer on the right.
  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Close">
        <Icon name="close" size={16} containerSize={32} container="circle" containerColor="glass" color="inkDim" />
      </Pressable>
      <AppText weight="black" size="lg">
        {isEdit ? "Edit Transaction" : "Add Transaction"}
      </AppText>
      <View style={styles.headerSpacer} />
    </View>
  );

  return (
    // A native modal route hosts its own portal — without this, gorhom sheets
    // (the account picker) render behind the modal and read as unclickable.
    <BottomSheetModalProvider>
    <ScreenScaffold header={header} scroll={false}>
      <View style={styles.body}>
        {/* Fixed top — the amount you're typing and its numpad stay paired on
            screen; only the secondary fields below scroll. */}
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
          keyboardShouldPersistTaps="handled"
        >
          {type !== "transfer" && (
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
          )}

          {/* Category — opens the shared tiered picker (search + create on the fly),
              same as Bills / Budgets. Hidden for transfers. */}
          {type !== "transfer" && (
            <View style={styles.field}>
              <Pressable style={styles.selRow} onPress={() => categoryRef.current?.present()}>
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
                  <AppText size="sm" weight="semibold" color={selectedCategory ? "ink" : "inkDim"}>
                    {selectedCategory?.name ?? "Choose a category"}
                  </AppText>
                </View>
                <Icon name="chevronRight" size={20} color="inkDim" />
              </Pressable>
              {errors.category && (
                <AppText size="xs" color="danger">{errors.category.message}</AppText>
              )}
            </View>
          )}

          {/* Accounts — a spend picks one source; a transfer picks source → destination.
              Not editable in edit mode (would need cross-account balance reconciliation). */}
          {!isEdit && type !== "transfer" && (
            <Pressable style={styles.selRow} onPress={() => accountRef.current?.present()}>
              <Icon name="wallet" size={18} color="inkDim" />
              <AppText size="sm" weight="bold" style={styles.selValue}>
                {account?.name ?? "Select account"}
              </AppText>
              <Icon name="chevronRight" size={20} color="inkDim" />
            </Pressable>
          )}

          {!isEdit && type === "transfer" && (
            <>
              <Pressable style={styles.selRow} onPress={() => accountRef.current?.present()}>
                <Icon name="wallet" size={18} color="inkDim" />
                <View style={styles.selText}>
                  <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>FROM</AppText>
                  <AppText size="sm" weight="bold">{account?.name ?? "Select account"}</AppText>
                </View>
                <Icon name="chevronRight" size={20} color="inkDim" />
              </Pressable>

              <Pressable style={styles.selRow} onPress={() => toAccountRef.current?.present()}>
                <Icon name="activity" size={18} color="inkDim" />
                <View style={styles.selText}>
                  <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>TO</AppText>
                  <AppText size="sm" weight="bold" color={toAccount ? "ink" : "inkDim"}>
                    {toAccount?.name ?? "Select destination"}
                  </AppText>
                </View>
                <Icon name="chevronRight" size={20} color="inkDim" />
              </Pressable>
            </>
          )}

          {/* Date + time row — defaults to now; tap to set when it actually happened. */}
          <DateField label="WHEN" mode="datetime" value={occurredAt} onChange={setOccurredAt} maximumDate={new Date()} />

          {/* Progressive disclosure — tap to reveal note + location fields. */}
          <Pressable
            style={[styles.selRow, !extrasOpen && styles.selRowDim]}
            onPress={() => setExtrasOpen((open) => !open)}
          >
            <Icon name="add" size={18} color="inkDim" />
            <AppText size="sm" weight="semibold" color={extrasOpen ? "ink" : "inkDim"} style={styles.selValue}>
              {extrasOpen ? "Note & location" : "Add note · location"}
            </AppText>
            <Icon name={extrasOpen ? "chevronDown" : "chevronRight"} size={20} color="inkDim" />
          </Pressable>

          {extrasOpen && (
            <>
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
            </>
          )}
        </ScrollView>

        {/* Fixed bottom — numpad + save, always visible with the amount above */}
        {submitError && (
          <AppText size="xs" color="danger">
            {submitError}
          </AppText>
        )}

        <View style={styles.numpad}>
          {KEYS.map((key) => (
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
  // Fixed top / scrollable middle / fixed bottom — keeps the amount hero and the
  // numpad on screen together, whatever the middle fields do.
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
  fieldLabel: {
    letterSpacing: 1.3, // spec .flabel
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
