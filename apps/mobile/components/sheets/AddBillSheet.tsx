import { forwardRef, useRef, useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { z } from "zod/v4";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BottomSheetModal, BottomSheetTextInput, useBottomSheetModal } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import CategoryPickerSheet from "./CategoryPickerSheet";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import Icon from "@/components/ui/Icon";
import DateField from "@/components/ui/DateField";
import AmountHeroInput from "@/components/ui/AmountHeroInput";
import { AppText } from "@/components/ui/AppText";
import { useCategoryById } from "@/lib/categories";
import { parseMoney } from "@/lib/money";
import { startOfToday, toUtcDateISO } from "@/lib/date";
import { post } from "@/lib/api";
import type { IconName } from "@/lib/icons";
import { colors, spacing } from "@/theme";
import type { ColorToken } from "@/theme";

type Props = {
  onChanged: () => void;
};

const schema = z.object({
  name: z.string().min(1, "Name is required").max(40, "Keep it under 40 characters"),
  amount: z
    .string()
    .regex(/^\s*₹?\s*[\d,]+(\.\d{1,2})?\s*$/, "Enter a valid amount")
    .refine((v) => parseMoney(v) > 0, "Enter a valid amount"),
  frequency: z.enum(["once", "monthly", "yearly"]),
  category: z.string().min(1, "Choose a category"),
  dueDate: z.date(),
  remind: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const defaults = (): FormValues => ({
  name: "",
  amount: "",
  frequency: "monthly",
  category: "",
  dueDate: startOfToday(),
  remind: true,
});

const AddBillSheet = forwardRef<BottomSheetModal, Props>(({ onChanged }, ref) => {
  const { dismiss } = useBottomSheetModal();
  const pickerRef = useRef<BottomSheetModal>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { isValid, errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: defaults(),
  });

  const category = useCategoryById(watch("category"));

  const onSubmit = async (data: FormValues) => {
    const recurring = data.frequency !== "once";
    setSubmitting(true);
    setError(null);
    try {
      await post("/bills", {
        name: data.name.trim(),
        amount: parseMoney(data.amount),
        category: data.category,
        dueDate: toUtcDateISO(data.dueDate),
        recurring,
        ...(recurring ? { frequency: data.frequency } : {}),
        ...(data.remind ? { reminderDays: 3 } : {}),
      });
      dismiss();
      onChanged();
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the bill");
    }
    finally {
      setSubmitting(false);
    }
  };

  return (
    <>
    <AppSheet ref={ref} onDismiss={() => { reset(defaults()); setError(null); }}>
      <View style={styles.header}>
        <AppText size="md" weight="black">
          Add Bill
        </AppText>
        <Pressable onPress={() => dismiss()} hitSlop={8} accessibilityLabel="Close">
          <Icon name="close" size={16} containerSize={32} container="circle" containerColor="glass" color="inkDim" />
        </Pressable>
      </View>

      <View style={styles.field}>
        <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
          NAME
        </AppText>
        <Controller
          control={control}
          name="name"
          render={({ field: { value, onChange, onBlur } }) => (
            <BottomSheetTextInput
              placeholder="e.g. Netflix"
              placeholderTextColor={colors.gray400}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              style={styles.input}
            />
          )}
        />
      </View>

      <View style={styles.field}>
        <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
          AMOUNT
        </AppText>
        <Controller
          control={control}
          name="amount"
          render={({ field: { value, onChange, onBlur } }) => (
            <AmountHeroInput value={value} onChangeText={onChange} onBlur={onBlur} />
          )}
        />
      </View>

      <Controller
        control={control}
        name="dueDate"
        render={({ field: { value, onChange } }) => (
          <DateField label="FIRST DUE" value={value} onChange={onChange} minimumDate={startOfToday()} />
        )}
      />

      <View style={styles.field}>
        <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
          REPEATS
        </AppText>
        <Controller
          control={control}
          name="frequency"
          render={({ field: { value } }) => (
            <View style={styles.segRow}>
              <Chip grow label="Once" selected={value === "once"} onPress={() => setValue("frequency", "once")} />
              <Chip grow label="Monthly" selected={value === "monthly"} onPress={() => setValue("frequency", "monthly")} />
              <Chip grow label="Yearly" selected={value === "yearly"} onPress={() => setValue("frequency", "yearly")} />
            </View>
          )}
        />
      </View>

      <Pressable style={styles.selRow} onPress={() => pickerRef.current?.present()}>
        <Icon
          name={(category?.icon ?? "add") as IconName}
          size={17}
          containerSize={34}
          containerRadius={11}
          container="square"
          gradient={(category?.color ?? "accent") as ColorToken}
        />
        <View style={styles.selText}>
          <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
            CATEGORY
          </AppText>
          <AppText size="sm" weight="semibold" color={category ? "ink" : "inkDim"}>
            {category?.name ?? "Choose a category"}
          </AppText>
        </View>
        <Icon name="chevronRight" size={20} color="inkDim" />
      </Pressable>

      <Controller
        control={control}
        name="remind"
        render={({ field: { value, onChange } }) => (
          <View style={styles.remindRow}>
            <View style={styles.remindText}>
              <AppText size="sm" weight="bold">
                Remind me before due
              </AppText>
              <AppText size="xs" color="inkDim">
                3 days before · notification only, money never moves
              </AppText>
            </View>
            <Switch
              value={value}
              onValueChange={onChange}
              trackColor={{ false: colors.surface2, true: colors.primary }}
              thumbColor={colors.surface}
            />
          </View>
        )}
      />

      {(errors.name || errors.amount || errors.category || error) && (
        <AppText size="xs" color="danger">
          {errors.name?.message ?? errors.amount?.message ?? errors.category?.message ?? error}
        </AppText>
      )}

      <Button label="Add Bill" onPress={handleSubmit(onSubmit)} loading={submitting} disabled={!isValid} />
    </AppSheet>

    <CategoryPickerSheet
      ref={pickerRef}
      kind="expense"
      onPick={(categoryId) => setValue("category", categoryId, { shouldValidate: true })}
    />
    </>
  );
});

AddBillSheet.displayName = "AddBillSheet";

const styles = StyleSheet.create({
  header: {
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
  input: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    color: colors.ink,
    fontSize: 16,
  },
  segRow: {
    flexDirection: "row",
    gap: 8,
  },
  selRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
  },
  selText: {
    flex: 1,
    gap: 2,
  },
  remindRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  remindText: {
    flex: 1,
    gap: 3,
  },
});

export default AddBillSheet;
