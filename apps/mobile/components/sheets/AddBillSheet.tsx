import { forwardRef, useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { z } from "zod/v4";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  BottomSheetModal,
  BottomSheetTextInput,
  useBottomSheetModal,
} from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import Icon from "@/components/ui/Icon";
import { AppText } from "@/components/ui/AppText";
import type { IconName } from "@/lib/icons";
import { parseMoney } from "@/lib/money";
import { formatFullDate } from "@/lib/date";
import { categories } from "@/lib/categories";
import { defaultAccountId } from "@/lib/mock";
import { colors, spacing } from "@/theme";

const expenseCategories = categories.filter((c) => c.kind === "expense");

// "Once" = one-off (recurring:false); Monthly/Yearly map to BillFrequency.
type Repeats = "once" | "monthly" | "yearly";
const REPEATS: { key: Repeats; label: string }[] = [
  { key: "once", label: "Once" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];

const schema = z.object({
  name: z.string().min(1, "Name is required").max(40, "Keep it under 40 characters"),
  amount: z
    .string()
    .regex(/^\s*₹?\s*[\d,]+(\.\d{1,2})?\s*$/, "Enter a valid amount")
    .refine((v) => parseMoney(v) > 0, "Enter a valid amount"),
  category: z.string().refine((c) => expenseCategories.some((cat) => cat._id === c), "Select a category"),
});

type FormValues = z.infer<typeof schema>;

const AddBillSheet = forwardRef<BottomSheetModal>((_props, ref) => {
  const { dismiss } = useBottomSheetModal();
  const [repeats, setRepeats] = useState<Repeats>("monthly");
  const [remind, setRemind] = useState(true);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { name: "", amount: "", category: "" },
  });

  const close = () => {
    setRepeats("monthly");
    setRemind(true);
    reset();
  };

  const onSubmit = (data: FormValues) => {
    // Status is never picked — new bills are pending (only PAID is stored). Due
    // date is stamped "today" as a placeholder until the date sub-picker lands.
    const newBill = {
      name: data.name,
      amount: parseMoney(data.amount),
      category: data.category,
      account: defaultAccountId,
      dueDate: new Date().toISOString(),
      status: "pending" as const,
      recurring: repeats !== "once",
      frequency: repeats === "once" ? undefined : repeats,
      reminderDays: remind ? 3 : undefined,
    };
    console.log(newBill);
    dismiss();
  };

  return (
    <AppSheet ref={ref} onDismiss={close}>
      <View style={styles.head}>
        <AppText size="lg" weight="black">
          Add Bill
        </AppText>
        <Pressable onPress={() => dismiss()} hitSlop={8} accessibilityLabel="Close">
          <Icon name="close" size={16} containerSize={32} container="circle" containerColor="glass" color="inkDim" />
        </Pressable>
      </View>

      <Controller
        control={control}
        name="name"
        render={({ field: { value, onChange, onBlur } }) => (
          <Input
            InputComponent={BottomSheetTextInput}
            label="Name"
            placeholder="e.g. Netflix"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.name?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="amount"
        render={({ field: { value, onChange, onBlur } }) => (
          <Input
            InputComponent={BottomSheetTextInput}
            label="Amount"
            placeholder="₹0"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.amount?.message}
            keyboardType="decimal-pad"
            size="lg"
          />
        )}
      />

      {/* FIRST DUE — static today; the date sub-picker lands with that milestone. */}
      <View style={styles.selRow}>
        <Icon name="date" size={18} color="inkDim" />
        <View style={styles.selText}>
          <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
            FIRST DUE
          </AppText>
          <AppText size="sm" weight="semibold">
            {formatFullDate(new Date().toISOString())}
          </AppText>
        </View>
        <Icon name="chevronRight" size={20} color="inkDim" />
      </View>

      {/* REPEATS segment */}
      <View style={styles.field}>
        <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
          REPEATS
        </AppText>
        <View style={styles.segment}>
          {REPEATS.map((r) => (
            <Chip
              key={r.key}
              label={r.label}
              grow
              selected={repeats === r.key}
              onPress={() => setRepeats(r.key)}
            />
          ))}
        </View>
      </View>

      {/* CATEGORY — inline chips (shared category sub-picker is a later milestone) */}
      <Controller
        control={control}
        name="category"
        render={({ field: { value, onChange } }) => (
          <View style={styles.field}>
            <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
              CATEGORY
            </AppText>
            <View style={styles.catWrap}>
              {expenseCategories.map((cat) => (
                <Chip
                  key={cat._id}
                  label={cat.name}
                  icon={cat.icon as IconName}
                  selected={value === cat._id}
                  onPress={() => onChange(cat._id)}
                />
              ))}
            </View>
            {errors.category && (
              <AppText size="xs" color="danger">{errors.category.message}</AppText>
            )}
          </View>
        )}
      />

      {/* Reminder — honest copy: notification only, money never moves. */}
      <View style={styles.toggleRow}>
        <View style={styles.toggleText}>
          <AppText size="sm" weight="bold">
            Remind me before due
          </AppText>
          <AppText size="xs" color="inkDim">
            3 days before · notification only, money never moves
          </AppText>
        </View>
        <Switch
          value={remind}
          onValueChange={setRemind}
          trackColor={{ false: colors.surface2, true: colors.primary }}
          thumbColor={colors.surface}
        />
      </View>

      <Button label="Add Bill" onPress={handleSubmit(onSubmit)} disabled={!isValid} />
    </AppSheet>
  );
});

AddBillSheet.displayName = "AddBillSheet";

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  field: {
    gap: spacing.sm,
  },
  label: {
    letterSpacing: 1.3,
  },
  segment: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  catWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  toggleText: {
    flex: 1,
    gap: 2,
  },
});

export default AddBillSheet;
