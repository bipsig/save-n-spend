import { forwardRef, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { IGoal } from "@save-n-spend/types";
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
import ProgressBar from "@/components/data/ProgressBar";
import { parseMoney } from "@/lib/money";
import formatMoney from "@/lib/money";
import type { IconName } from "@/lib/icons";
import { spacing } from "@/theme";
import type { ColorToken } from "@/theme";

type Props = {
  goal: IGoal | null;
};

// Quick-set presets (paise) — spec .presetrow. Tapping writes into the same
// amount field; typing overrides.
const PRESETS = [50000, 100000, 250000, 500000];

const ContributeSheet = forwardRef<BottomSheetModal, Props>(({ goal }, ref) => {
  const { dismiss } = useBottomSheetModal();

  const remaining = goal ? Math.max(goal.target - goal.saved, 0) : 0;
  const color = (goal?.color ?? "accent") as ColorToken;

  // Schema depends on the goal's remaining amount — you can't over-fund a goal.
  const schema = useMemo(
    () =>
      z.object({
        amount: z
          .string()
          .regex(/^\s*₹?\s*[\d,]+(\.\d{1,2})?\s*$/, "Enter a valid amount")
          .refine((v) => parseMoney(v) > 0, "Enter a valid amount")
          .refine(
            (v) => parseMoney(v) <= remaining,
            `Only ${formatMoney(remaining)} left to reach this goal`
          ),
      }),
    [remaining]
  );

  type FormValues = z.infer<typeof schema>;

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { amount: "" },
  });

  const entered = parseMoney(watch("amount"));
  const projected = goal ? Math.min(goal.saved + (entered > 0 ? entered : 0), goal.target) : 0;
  const projectedPct = goal && goal.target > 0 ? Math.round((projected / goal.target) * 100) : 0;
  const currentPct = goal && goal.target > 0 ? Math.round((goal.saved / goal.target) * 100) : 0;

  const onSubmit = (data: FormValues) => {
    if (!goal) return;
    // Payload for POST /goals/:id/contribute — no persistence yet.
    console.log({ goalId: goal._id, amount: parseMoney(data.amount) });
    dismiss();
  };

  return (
    <AppSheet ref={ref} onDismiss={() => reset()}>
      {goal && (
        <>
          {/* Spec .centerid — the card's identity repeated so context never drops */}
          <View style={styles.identity}>
            <Icon
              name={(goal.icon ?? "savings") as IconName}
              size={30}
              containerSize={64}
              containerRadius={21}
              container="square"
              gradient={color}
            />
            <AppText size="md" weight="black">
              {goal.name}
            </AppText>
            <AppText size="xs" color="inkDim">
              {`${formatMoney(goal.saved)} of ${formatMoney(goal.target)} · ${currentPct}%`}
            </AppText>
          </View>

          <ProgressBar value={projectedPct} color={color} height={8} />

          <View style={styles.field}>
            <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
              ADD MONEY
            </AppText>

            {/* Spec .presetrow — quick amounts; typing overrides */}
            <View style={styles.presetRow}>
              {PRESETS.map((paise) => {
                const selected = entered === paise;
                return (
                  <Pressable
                    key={paise}
                    onPress={() =>
                      setValue("amount", String(paise / 100), { shouldValidate: true })
                    }
                    style={[styles.preset, selected && styles.presetOn]}
                  >
                    <AppText
                      size="xs"
                      weight="bold"
                      color={selected ? "surface" : "inkDim"}
                    >
                      {formatMoney(paise)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Controller
            control={control}
            name="amount"
            render={({ field: { value, onChange, onBlur } }) => (
              <View style={styles.amountBlock}>
                <Input
                  InputComponent={BottomSheetTextInput}
                  placeholder="₹0"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.amount?.message}
                  keyboardType="decimal-pad"
                  size="lg"
                />
                <AppText size="xs" color="inkDim">
                  {`${formatMoney(remaining)} to go — contributions cap at the target`}
                </AppText>
              </View>
            )}
          />

          {/* Spec: live CTA — the amount AND the resulting % */}
          <Button
            label={
              isValid && entered > 0
                ? `Add ${formatMoney(entered)} · goal reaches ${projectedPct}%`
                : "Add money"
            }
            onPress={handleSubmit(onSubmit)}
            disabled={!isValid}
          />
        </>
      )}
    </AppSheet>
  );
});

ContributeSheet.displayName = "ContributeSheet";

const styles = StyleSheet.create({
  identity: {
    alignItems: "center",
    gap: 8, // spec .centerid gap × device scale
  },
  field: {
    gap: spacing.sm,
  },
  label: {
    letterSpacing: 1.3, // spec .flabel
  },
  presetRow: {
    flexDirection: "row",
    gap: 9, // spec .presetrow gap × device scale
  },
  preset: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  presetOn: {
    backgroundColor: "#7C6BF8",
    borderColor: "transparent",
    shadowColor: "#6D5CFF",
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  amountBlock: {
    gap: spacing.sm,
  },
});

export default ContributeSheet;
