import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import { z } from "zod/v4";
import formatMoney, { parseMoney } from "@/lib/money";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useCategories } from "@/lib/categories";
import Chip from "@/components/ui/Chip";
import type { IconName } from "@/lib/icons";
import { spacing } from "@/theme";
import { useDefaultAccount } from "@/lib/accounts";
import { post } from "@/lib/api";

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  amount: z
    .string()
    .regex(/^\s*₹?\s*[\d,]+(\.\d{1,2})?\s*$/, "Enter a valid amount")
    .refine((v) => parseMoney(v) > 0, "Enter a valid amount"),
  type: z.enum(["income", "expense"]),
  // The picker only renders real categories (kind-filtered), so a non-empty
  // selection is a valid one; the server is the source of truth on save.
  category: z.string().min(1, "Select a category"),
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

const AddTransaction = () => {
  const router = useRouter();
  const categories = useCategories();
  const { control, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", amount: "", category: "", type: "expense" }
  })

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Spec: the CTA label is live — it names what you're saving.
  const type = watch("type");
  const amountRaw = watch("amount");

  // Balance preview — a values-in-hand derivation from the default account.
  const account = useDefaultAccount();
  const entered = parseMoney(amountRaw);
  const balanceLine = useMemo(() => {
    if (!account) return null;
    if (!(entered > 0)) {
      return `From ${account.name} · ${formatMoney(account.balance)} available`;
    }
    const after = type === "income" ? account.balance + entered : account.balance - entered;
    return `${type === "income" ? "To" : "From"} ${account.name} · ${formatMoney(after)} ${type === "income" ? "after this" : "left after this"}`;
  }, [account, entered, type]);

  // occurredAt is stamped "now" on save — the date row states that honestly.
  const dateLabel = useMemo(() => {
    const time = new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
    return `Today · ${time}`;
  }, []);

  const setAmount = (next: string) =>
    setValue("amount", next, { shouldValidate: true });

  // The category row is kind-filtered; switching type drops a selection
  // that no longer belongs (an income can't keep a Food category).
  const switchType = (next: FormValues["type"]) => {
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
    // Build a payload shaped like ITransaction: positive amount, `type` gives direction.

    if (!account) {
      setSubmitError("Account is missing");
      return;
    }

    const newTransaction = {
      type: data.type,
      amount: parseMoney(data.amount), // paise, positive
      category: data.category,
      account: account._id,
      title: data.title,
    };

    setSubmitting(true);
    setSubmitError(null);
    try {
      await post("/transactions", newTransaction);
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
        Add Transaction
      </AppText>
      <View style={styles.headerSpacer} />
    </View>
  );

  return (
    <ScreenScaffold header={header}>
      {/* Income / Expense — spec .seg full-width segmented control */}
      <Controller
        control={control}
        name="type"
        render={({ field: { value } }) => (
          <View style={styles.segRow}>
            <Chip
              grow
              label="Expense"
              selected={value === "expense"}
              onPress={() => switchType("expense")}
            />
            <Chip
              grow
              label="Income"
              selected={value === "income"}
              onPress={() => switchType("income")}
            />
          </View>
        )}
      />

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

      {/* Category — two tiers: top-level chips, then the selected parent's
          sub-categories reveal below. The stored value is the deepest chip
          tapped (parent, or a child if you drilled in). */}
      <Controller
        control={control}
        name="category"
        render={({ field: { value, onChange } }) => {
          const parents = categories.filter((c) => c.parent === null && c.kind === type);
          const selectedCat = categories.find((c) => c._id === value);
          // The parent whose children we reveal: the selection itself if it's
          // top-level, else the selected child's parent.
          const expandedParentId = selectedCat ? selectedCat.parent ?? selectedCat._id : null;
          const children = expandedParentId
            ? categories.filter((c) => c.parent === expandedParentId)
            : [];

          return (
            <View style={styles.field}>
              <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>CATEGORY</AppText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipScroll}
                contentContainerStyle={styles.row}
              >
                {parents.map((parent) => (
                  <Chip
                    key={parent._id}
                    label={parent.name}
                    icon={parent.icon as IconName}
                    selected={value === parent._id}
                    // Lit as a "trail" when the real selection is one of its children.
                    active={selectedCat?.parent === parent._id}
                    onPress={() => onChange(parent._id)}
                  />
                ))}
              </ScrollView>

              {children.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.chipScroll}
                  contentContainerStyle={[styles.row, styles.subRow]}
                >
                  {children.map((child) => (
                    <Chip
                      key={child._id}
                      label={child.name}
                      icon={child.icon as IconName}
                      selected={value === child._id}
                      onPress={() => onChange(child._id)}
                    />
                  ))}
                </ScrollView>
              )}

              {errors.category && (
                <AppText size="xs" color="danger">{errors.category.message}</AppText>
              )}
            </View>
          );
        }}
      />

      {/* Date row — spec .selrow. Picker sub-sheet is a later milestone;
          the transaction is stamped with "now" on save. */}
      <View style={styles.selRow}>
        <Icon name="date" size={18} color="inkDim" />
        <AppText size="sm" weight="bold" style={styles.selValue}>
          {dateLabel}
        </AppText>
        <Icon name="chevronRight" size={20} color="inkDim" />
      </View>

      {/* Progressive disclosure — note / location / receipt (later milestone) */}
      <View style={[styles.selRow, styles.selRowDim]}>
        <Icon name="add" size={18} color="inkDim" />
        <AppText size="sm" weight="semibold" color="inkDim" style={styles.selValue}>
          Add note · location · receipt
        </AppText>
      </View>

      {/* Numpad — spec .numpad glass keys */}
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

      {submitError && (
        <AppText size="xs" color="danger">
          {submitError}
        </AppText>
      )}
      <Button
        onPress={handleSubmit(onSubmit)}
        loading={submitting}
        label={type === "income" ? "Save Income" : "Save Expense"}
      />
    </ScreenScaffold>
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
  field: {
    gap: spacing.sm,
  },
  fieldLabel: {
    letterSpacing: 1.3, // spec .flabel
  },
  segRow: {
    flexDirection: "row",
    gap: 8, // spec .seg gap × device scale
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
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  chipScroll: {
    flexGrow: 0,
  },
  // Sub-category row sits slightly indented so the hierarchy reads at a glance.
  subRow: {
    paddingLeft: spacing.md,
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
