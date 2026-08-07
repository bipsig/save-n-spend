import { forwardRef, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { z } from "zod/v4";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BottomSheetModal, BottomSheetTextInput, useBottomSheetModal } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { AppText } from "@/components/ui/AppText";
import ProgressBar from "@/components/data/ProgressBar";
import formatMoney, { parseMoney, paiseToInput } from "@/lib/money";
import { useCategoryById } from "@/lib/categories";
import { post, patch, del } from "@/lib/api";
import type { BudgetSummary } from "@/lib/budgets";
import type { IconName } from "@/lib/icons";
import { colors, spacing } from "@/theme";
import type { ColorToken } from "@/theme";

type Props = {
  month: string;
  summary: BudgetSummary | null;
  categoryId: string | null;
  onChanged: () => void;
};

const schema = z.object({
  limit: z
    .string()
    .regex(/^\s*₹?\s*[\d,]+(\.\d{1,2})?\s*$/, "Enter a valid amount")
    .refine((v) => parseMoney(v) > 0, "Enter a valid amount"),
});

type FormValues = z.infer<typeof schema>;

const STEPS = [-50000, 50000, 100000];

const BudgetLimitSheet = forwardRef<BottomSheetModal, Props>(({ month, summary, categoryId, onChanged }, ref) => {
  const { dismiss } = useBottomSheetModal();
  const isEdit = !!summary;
  const category = useCategoryById(summary?.budget.category ?? categoryId ?? null);
  const spent = summary?.spent ?? 0;

  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { limit: "" },
  });

  useEffect(() => {
    reset({ limit: summary ? paiseToInput(summary.budget.limit) : "" });
  }, [summary, categoryId, reset]);

  const entered = parseMoney(watch("limit"));
  const hasLimit = entered > 0;
  const over = hasLimit && spent > entered;
  const percent = hasLimit ? Math.min((spent / entered) * 100, 100) : 0;
  const meterColor: ColorToken = over ? "danger" : percent >= 80 ? "warning" : "success";

  const step = (delta: number) => {
    const nextPaise = Math.max(0, (hasLimit ? entered : 0) + delta);
    setValue("limit", nextPaise === 0 ? "" : paiseToInput(nextPaise), { shouldValidate: true });
  };

  const onSave = async (data: FormValues) => {
    setSaving(true);
    setError(null);
    try {
      if (summary) {
        await patch(`/budgets/${summary.budget._id}`, { limit: parseMoney(data.limit) });
      }
      else {
        await post("/budgets", { category: categoryId, month, limit: parseMoney(data.limit) });
      }
      dismiss();
      onChanged();
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the budget");
    }
    finally {
      setSaving(false);
    }
  };

  const onRemove = async () => {
    if (!summary) return;
    setRemoving(true);
    setError(null);
    try {
      await del(`/budgets/${summary.budget._id}`);
      dismiss();
      onChanged();
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove the budget");
    }
    finally {
      setRemoving(false);
    }
  };

  const verb = isEdit ? "Save" : "Create";
  const ctaLabel = !isValid
    ? isEdit ? "Save limit" : "Create budget"
    : over
      ? `${verb} · ${formatMoney(spent - entered)} over`
      : `${verb} · ${formatMoney(entered - spent)} left`;

  return (
    <AppSheet ref={ref} onDismiss={() => setError(null)}>
      <View style={styles.identity}>
        <Icon
          name={(category?.icon ?? "more") as IconName}
          size={30}
          containerSize={64}
          containerRadius={21}
          container="square"
          gradient={(category?.color ?? "accent") as ColorToken}
        />
        <AppText size="md" weight="black">
          {category?.name ?? "Category"}
        </AppText>
        <AppText size="xs" color="inkDim">
          {isEdit ? `Spent ${formatMoney(spent)} so far this month` : "Set a monthly limit"}
        </AppText>
      </View>

      <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
        MONTHLY LIMIT
      </AppText>

      <Controller
        control={control}
        name="limit"
        render={({ field: { value, onChange, onBlur } }) => (
          <View style={styles.heroRow}>
            <AppText size="lg" weight="bold" color="inkDim" style={styles.heroCur}>
              ₹
            </AppText>
            <BottomSheetTextInput
              placeholder="0"
              placeholderTextColor={colors.gray400}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              keyboardType="decimal-pad"
              style={styles.heroInput}
            />
          </View>
        )}
      />

      <View style={styles.steps}>
        {STEPS.map((delta) => (
          <Pressable key={delta} style={styles.step} onPress={() => step(delta)}>
            <AppText size="sm" weight="bold" color="inkDim">
              {`${delta < 0 ? "−" : "+"} ${formatMoney(Math.abs(delta))}`}
            </AppText>
          </Pressable>
        ))}
      </View>

      <View style={styles.meter}>
        <View style={styles.meterTop}>
          <AppText size="xs" color="inkDim">
            {over ? "Already over at this limit" : `At this limit you're at ${Math.round(percent)}% used`}
          </AppText>
          <AppText size="xs" weight="bold" color={meterColor}>
            {`${Math.round(percent)}%`}
          </AppText>
        </View>
        <ProgressBar value={percent} color={meterColor} height={6} />
      </View>

      {errors.limit && (
        <AppText size="xs" color="danger">
          {errors.limit.message}
        </AppText>
      )}
      {error && (
        <AppText size="xs" color="danger">
          {error}
        </AppText>
      )}

      <Button label={ctaLabel} onPress={handleSubmit(onSave)} loading={saving} disabled={!isValid} />
      {isEdit && (
        <Button label="Remove from budget" variant="dangerGhost" onPress={onRemove} loading={removing} />
      )}
    </AppSheet>
  );
});

BudgetLimitSheet.displayName = "BudgetLimitSheet";

const styles = StyleSheet.create({
  identity: {
    alignItems: "center",
    gap: 8,
  },
  label: {
    letterSpacing: 1.3,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  heroCur: {
    marginRight: 4,
    marginBottom: 8,
  },
  heroInput: {
    color: colors.ink,
    fontSize: 44,
    fontWeight: "800",
    letterSpacing: -1,
    minWidth: 120,
    textAlign: "center",
  },
  steps: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  step: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  meter: {
    gap: 6,
  },
  meterTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});

export default BudgetLimitSheet;
