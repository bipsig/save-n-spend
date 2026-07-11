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
import { AppText } from "@/components/ui/AppText";
import ProgressBar from "@/components/data/ProgressBar";
import { parseMoney } from "@/lib/money";
import formatMoney from "@/lib/money";
import { spacing } from "@/theme";
import type { ColorToken } from "@/theme";

type Props = {
  goal: IGoal | null;
};

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
          <View>
            <AppText size="sm" color="gray500">
              Contribute to
            </AppText>
            <AppText size="xl" weight="black">
              {goal.name}
            </AppText>
          </View>

          <View style={styles.progressBlock}>
            <ProgressBar value={projectedPct} color={color} />
            <View style={styles.progressRow}>
              <AppText size="sm" color="gray500">
                {`${formatMoney(projected)} of ${formatMoney(goal.target)}`}
              </AppText>
              <AppText size="sm" weight="bold" color={color}>
                {`${projectedPct}%`}
              </AppText>
            </View>
          </View>

          <Controller
            control={control}
            name="amount"
            render={({ field: { value, onChange, onBlur } }) => (
              <View style={styles.amountBlock}>
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
                <Pressable
                  onPress={() => setValue("amount", String(remaining / 100), { shouldValidate: true })}
                  hitSlop={6}
                >
                  <AppText size="sm" weight="bold" color="primary">
                    {`Add all — ${formatMoney(remaining)}`}
                  </AppText>
                </Pressable>
              </View>
            )}
          />

          <Button label="Contribute" onPress={handleSubmit(onSubmit)} disabled={!isValid} />
        </>
      )}
    </AppSheet>
  );
});

ContributeSheet.displayName = "ContributeSheet";

const styles = StyleSheet.create({
  progressBlock: {
    gap: spacing.sm,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  amountBlock: {
    gap: spacing.sm,
  },
});

export default ContributeSheet;
