import { forwardRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
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
import { AppText } from "@/components/ui/AppText";
import { parseMoney } from "@/lib/money";
import type { IconName } from "@/lib/icons";
import { colors, spacing } from "@/theme";
import type { ColorToken } from "@/theme";

// Goal identity options (visual pickers, not free text).
const ICONS: IconName[] = ["savings", "health", "trophy", "wallet", "investments", "transport"];
const COLORS: ColorToken[] = ["accent", "info", "success", "warning", "danger"];

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

const NewGoalSheet = forwardRef<BottomSheetModal>((_props, ref) => {
  const { dismiss } = useBottomSheetModal();
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

  const onSubmit = (data: FormValues) => {
    // Build an IGoal-shaped payload. A new goal starts at 0 saved; no persistence
    // yet (store/API milestone) — same as Add Transaction.
    const newGoal = {
      name: data.name,
      target: parseMoney(data.amount), // paise
      saved: 0,
      icon: data.icon,
      color: data.color,
    };
    console.log(newGoal);
    dismiss();
  };

  return (
    <AppSheet ref={ref} onDismiss={() => reset()}>
      <AppText size="xl" weight="black">
        New goal
      </AppText>

      <Controller
        control={control}
        name="name"
        render={({ field: { value, onChange, onBlur } }) => (
          <Input
            InputComponent={BottomSheetTextInput}
            label="Goal name"
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
            label="Target amount"
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

      {/* Icon picker */}
      <Controller
        control={control}
        name="icon"
        render={({ field: { value, onChange } }) => (
          <View style={styles.field}>
            <AppText size="sm" weight="bold" color="gray600">
              Icon
            </AppText>
            <View style={styles.row}>
              {ICONS.map((name) => {
                const selected = value === name;
                return (
                  <Pressable key={name} onPress={() => onChange(name)} hitSlop={4}>
                    <Icon
                      name={name}
                      size={22}
                      container="square"
                      containerColor={selected ? "accentSoft" : "surface2"}
                      color={selected ? "primary" : "gray500"}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      />

      {/* Color picker */}
      <Controller
        control={control}
        name="color"
        render={({ field: { value, onChange } }) => (
          <View style={styles.field}>
            <AppText size="sm" weight="bold" color="gray600">
              Color
            </AppText>
            <View style={styles.row}>
              {COLORS.map((token) => {
                const selected = value === token;
                return (
                  <Pressable
                    key={token}
                    onPress={() => onChange(token)}
                    hitSlop={4}
                    style={[
                      styles.swatch,
                      { backgroundColor: colors[token] },
                      selected && styles.swatchSelected,
                    ]}
                  />
                );
              })}
            </View>
          </View>
        )}
      />

      <Button
        label="Create goal"
        onPress={handleSubmit(onSubmit)}
        disabled={!isValid}
      />
    </AppSheet>
  );
});

NewGoalSheet.displayName = "NewGoalSheet";

const styles = StyleSheet.create({
  field: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: "transparent",
  },
  swatchSelected: {
    borderColor: colors.ink,
  },
});

export default NewGoalSheet;
