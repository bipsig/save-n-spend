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
import Icon from "@/components/ui/Icon";
import IconPicker from "@/components/ui/IconPicker";
import ColorPicker from "@/components/ui/ColorPicker";
import DateField from "@/components/ui/DateField";
import { AppText } from "@/components/ui/AppText";
import { parseMoney } from "@/lib/money";
import { startOfToday, toUtcDateISO } from "@/lib/date";
import { post } from "@/lib/api";
import type { IconName } from "@/lib/icons";
import { colors, spacing } from "@/theme";
import type { ColorToken } from "@/theme";

const defaultDeadline = (): Date => {
  const d = startOfToday();
  d.setMonth(d.getMonth() + 6);
  return d;
};

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  amount: z
    .string()
    .regex(/^\s*₹?\s*[\d,]+(\.\d{1,2})?\s*$/, "Enter a valid amount")
    .refine((v) => parseMoney(v) > 0, "Enter a valid amount"),
  icon: z.string(),
  color: z.string(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  onChanged: () => void;
};

const NewGoalSheet = forwardRef<BottomSheetModal, Props>(({ onChanged }, ref) => {
  const { dismiss } = useBottomSheetModal();
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { name: "", amount: "", icon: "savings", color: "accent" },
  });

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);
    setError(null);
    try {
      await post("/goals", {
        name: data.name.trim(),
        target: parseMoney(data.amount),
        icon: data.icon,
        color: data.color,
        ...(deadline ? { deadline: toUtcDateISO(deadline) } : {}),
      });
      dismiss();
      onChanged();
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the goal");
    }
    finally {
      setSubmitting(false);
    }
  };

  return (
    <AppSheet ref={ref} onDismiss={() => { reset(); setDeadline(null); setError(null); }}>
      {/* Spec .shead — title + ✕ */}
      <View style={styles.head}>
        <AppText size="lg" weight="black">
          New Goal
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
            placeholder="e.g. Europe Trip"
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
            label="Target"
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

      {/* Icon + colour — shared pickers (same components as the new-category flow). */}
      <Controller
        control={control}
        name="icon"
        render={({ field: { value, onChange } }) => (
          <View style={styles.field}>
            <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
              ICON
            </AppText>
            <IconPicker value={value as IconName} onChange={onChange} />
          </View>
        )}
      />

      <Controller
        control={control}
        name="color"
        render={({ field: { value, onChange } }) => (
          <View style={styles.field}>
            <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
              COLOUR
            </AppText>
            <ColorPicker value={value as ColorToken} onChange={onChange} />
          </View>
        )}
      />

      <View style={styles.field}>
        <View style={styles.deadlineHead}>
          <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
            TARGET DATE
          </AppText>
          <Switch
            value={deadline !== null}
            onValueChange={(on) => setDeadline(on ? defaultDeadline() : null)}
            trackColor={{ false: colors.surface2, true: colors.primary }}
            thumbColor={colors.surface}
          />
        </View>
        {deadline && (
          <DateField label="DEADLINE" value={deadline} onChange={setDeadline} minimumDate={startOfToday()} />
        )}
      </View>

      {error && (
        <AppText size="xs" color="danger">
          {error}
        </AppText>
      )}

      <Button
        label="Create Goal"
        onPress={handleSubmit(onSubmit)}
        loading={submitting}
        disabled={!isValid}
      />
    </AppSheet>
  );
});

NewGoalSheet.displayName = "NewGoalSheet";

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
    letterSpacing: 1.3, // spec .flabel
  },
  deadlineHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});

export default NewGoalSheet;
