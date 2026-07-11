import { forwardRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { z } from "zod/v4";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LinearGradient } from "expo-linear-gradient";
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
import { spacing } from "@/theme";
import type { ColorToken } from "@/theme";
import { chipGradients, chipTintFor } from "@/theme/gradients";

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

      {/* Icon picker — spec .ipick: 42px cells, radius 13; selected = violet ring + glow */}
      <Controller
        control={control}
        name="icon"
        render={({ field: { value, onChange } }) => (
          <View style={styles.field}>
            <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
              ICON
            </AppText>
            <View style={styles.row}>
              {ICONS.map((name) => {
                const selected = value === name;
                return (
                  <Pressable
                    key={name}
                    onPress={() => onChange(name)}
                    hitSlop={4}
                    style={[styles.iconCell, selected && styles.iconCellOn]}
                  >
                    <Icon name={name} size={22} color={selected ? "surface" : "inkDim"} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      />

      {/* Colour picker — spec .swrow: 29px gradient swatches, white ring when on */}
      <Controller
        control={control}
        name="color"
        render={({ field: { value, onChange } }) => (
          <View style={styles.field}>
            <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
              COLOUR
            </AppText>
            <View style={styles.row}>
              {COLORS.map((token) => {
                const selected = value === token;
                return (
                  <Pressable
                    key={token}
                    onPress={() => onChange(token)}
                    hitSlop={4}
                    style={[styles.swatchRing, selected && styles.swatchRingOn]}
                  >
                    <LinearGradient
                      colors={[...chipGradients[chipTintFor(token)]]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0.8, y: 1 }}
                      style={styles.swatch}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      />

      <Button
        label="Create Goal"
        onPress={handleSubmit(onSubmit)}
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
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  iconCell: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  iconCellOn: {
    backgroundColor: "rgba(139,123,255,0.2)",
    borderWidth: 1.5,
    borderColor: "#A394FF",
    shadowColor: "#8B7BFF",
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  swatchRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  swatchRingOn: {
    borderColor: "#FFFFFF",
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
});

export default NewGoalSheet;
