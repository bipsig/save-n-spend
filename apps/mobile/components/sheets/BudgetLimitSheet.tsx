import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { z } from "zod/v4";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import ConfirmSheet from "./ConfirmSheet";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import AmountHeroInput from "@/components/ui/AmountHeroInput";
import { AppText } from "@/components/ui/AppText";
import Caps from "@/components/ui/Caps";
import ProgressBar from "@/components/data/ProgressBar";
import formatMoney, { formatRemaining, parseMoney, paiseToInput, usePrivacyMask } from "@/lib/money";
import { formatPct } from "@/lib/format/pct";
import { useCategoryById } from "@/lib/categories";
import CategoryName from "@/components/ui/CategoryName";
import { post, patch } from "@/lib/api";
import { deleteTarget, deleteWithUndo } from "@/lib/undo";
import { splitIssues } from "@/lib/apiError";
import { holderFor } from "@/lib/idempotency";
import { haptics } from "@/lib/haptics";
import { isMonthClosed, monthTitle, type BudgetSummary } from "@/lib/budgets";
import { toast } from "@/store/toast";
import type { IconName } from "@/lib/icons";
import { spacing } from "@/theme";
import type { ColorToken } from "@/theme";
import { useOnlineGate } from "@/lib/onlineGate";
import { editWithUndo } from "@/lib/undo";
import { useFormError } from "@/lib/useFormError";
import FormError from "@/components/ui/FormError";

type Props = {
  month: string;
  summary: BudgetSummary | null;
  categoryId: string | null;
  /** Create mode — opens the category picker (the form stays mounted behind it). */
  onPickCategoryPress?: () => void;
  /** Optional: the write already refreshes every screen showing budgets. */
  onChanged?: () => void;
};

const schema = z.object({
  limit: z
    .string()
    .regex(/^\s*₹?\s*[\d,]+(\.\d{1,2})?\s*$/, "Enter a valid amount")
    .refine((v) => parseMoney(v) > 0, "Enter a valid amount"),
});

type FormValues = z.infer<typeof schema>;

const STEPS = [-50000, 50000, 100000];

const BudgetLimitSheet = forwardRef<BottomSheetModal, Props>(({ month, summary, categoryId, onPickCategoryPress, onChanged }, ref) => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below
  // Own handle, so `dismiss` closes this form and not the category picker that may
  // still be animating out on top of it (see CategoryPickerSheet).
  const innerRef = useRef<BottomSheetModal>(null);
  const confirmRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const removeGate = useOnlineGate("Remove from budget");
  const dismiss = () => innerRef.current?.dismiss();

  const isEdit = !!summary;
  const closed = isMonthClosed(month);
  const category = useCategoryById(summary?.budget.category ?? categoryId ?? null);
  const spent = summary?.spent ?? 0;

  const [saving, setSaving] = useState(false);
  const { error, fail, clear: clearError } = useFormError();

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    setError: setFieldError,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { limit: "" },
  });

  // Also on dismiss: reopening on the same budget (same props) must not show a cancelled edit.
  const resetForm = () => {
    reset({ limit: summary ? paiseToInput(summary.budget.limit) : "" });
    clearError();
  };

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
    clearError();
    let saved: { updatedAt?: string } | null = null;
    try {
      if (summary) {
        saved = await patch<{ updatedAt?: string }>(`/budgets/${summary.budget._id}`, { limit: parseMoney(data.limit) });
      }
      else {
        const body = { category: categoryId, month, limit: parseMoney(data.limit) };
        const idem = holderFor("budget:new");
        await post("/budgets", body, { idempotencyKey: idem.keyFor("POST", "/budgets", body) });
        idem.reset();
      }
      dismiss();
      onChanged?.();
      // Warned rather than plain success when the limit is already blown: the sheet
      // said so before saving, and the tone has to carry that through instead of
      // congratulating the user on a budget they're over.
      const receipt = over
        ? `${name} limit set to ${formatMoney(parseMoney(data.limit))} — already ${formatMoney(spent - entered)} over`
        : `${name} limit ${isEdit ? "updated" : "set"} to ${formatMoney(parseMoney(data.limit))}`;
      if (summary) {
        editWithUndo({ path: `/budgets/${summary.budget._id}`, previous: { limit: summary.budget.limit }, saved, message: receipt, tone: over ? "warning" : "success" });
      }
      else if (over) toast.warning(receipt);
      else toast.success(receipt);
    }
    catch (err) {
      // Kept in the sheet: the limit is still in the field beside the meter that
      // explains it, and a banner would expire before either is re-read.
      const { byField, rest } = splitIssues(err, { limit: "limit" } as const, "Couldn't save the budget");
      if (byField.limit) setFieldError("limit", { message: byField.limit });
      fail(rest);
    }
    finally {
      setSaving(false);
    }
  };

  const name = category?.name ?? "Category";

  // Confirmed in its own sheet, then held for the undo window like every delete; the Budget
  // screen hides the row meanwhile.
  const onRemove = () => {
    if (!summary) return;
    const id = summary.budget._id;
    dismiss();
    confirmRef.current?.present();
    setRemovingId(id);
  };
  const [removingId, setRemovingId] = useState<string | null>(null);
  const confirmRemove = () => {
    if (!removingId) return;
    deleteWithUndo({ ...deleteTarget.budget(removingId), label: `the ${name} budget`, message: `${name} budget removed`, onCommitted: onChanged });
  };

  const needsCategory = !isEdit && !categoryId;
  const verb = isEdit ? "Save" : "Create";
  const ctaLabel = needsCategory
    ? "Choose a category"
    : !isValid
      ? isEdit ? "Save limit" : "Create budget"
      : `${verb} · ${formatRemaining(entered - spent)}`;
  const saveGate = useOnlineGate(ctaLabel);

  // Create mode picks its category in-form; edit mode's category is fixed.
  const identity = (
    <>
      <Icon
        name={(category?.icon ?? (isEdit ? "more" : "add")) as IconName}
        size={30}
        containerSize={64}
        containerRadius={21}
        container="square"
        gradient={(category?.color ?? "accent") as ColorToken}
      />
      {/* Breadcrumbed, because budgeting a sub-category and budgeting its parent are
          different decisions with the same-looking name — and the roll-up means a limit
          on the parent already covers this one. */}
      <CategoryName
        categoryId={summary?.budget.category ?? categoryId}
        size="md"
        weight="black"
        inline
        placeholder="Choose a category"
      />
      <AppText size="xs" color="inkDim">
        {isEdit
          ? closed
            ? `Spent ${formatMoney(spent)} in ${monthTitle(month)}`
            : `Spent ${formatMoney(spent)} so far this month`
          : category
            ? `Tap to change · then set a limit for ${monthTitle(month)}`
            : `Tap to pick which category to budget in ${monthTitle(month)}`}
      </AppText>
    </>
  );

  return (
    <>
    <AppSheet ref={innerRef} onDismiss={resetForm}>
      {isEdit ? (
        <View style={styles.identity}>{identity}</View>
      ) : (
        <PressableScale style={styles.identity} onPress={onPickCategoryPress} scaleTo={0.96}>
          {identity}
        </PressableScale>
      )}

      <Caps>{closed ? `Limit for ${monthTitle(month)}` : "Monthly limit"}</Caps>

      <Controller
        control={control}
        name="limit"
        render={({ field: { value, onChange, onBlur } }) => (
          <AmountHeroInput value={value} onChangeText={onChange} onBlur={onBlur} />
        )}
      />

      <View style={styles.steps}>
        {STEPS.map((delta) => (
          // `select`, not the default tap: a step nudges the field rather than
          // committing anything, and these are usually pressed several times in a row.
          <PressableScale
            key={delta}
            style={styles.step}
            onPress={() => {
              haptics.select();
              step(delta);
            }}
            scaleTo={0.94}
            haptic={false}
          >
            <AppText size="sm" weight="bold" color="inkDim">
              {formatMoney(delta, { sign: "always" })}
            </AppText>
          </PressableScale>
        ))}
      </View>

      <View style={styles.meter}>
        <View style={styles.meterTop}>
          <AppText size="xs" color="inkDim">
            {over ? "Already over at this limit" : `At this limit you're at ${formatPct(percent)} used`}
          </AppText>
          <AppText size="xs" weight="bold" color={meterColor}>
            {formatPct(percent)}
          </AppText>
        </View>
        <ProgressBar value={percent} color={meterColor} height={6} />
      </View>

      {errors.limit && (
        <AppText size="xs" weight="bold" color="danger">
          {errors.limit.message}
        </AppText>
      )}
      <FormError message={error} />

      <Button label={saveGate.label} icon={saveGate.icon} hint={saveGate.hint} onPress={handleSubmit(onSave)} loading={saving} disabled={!saveGate.allowed || !isValid || needsCategory} />
      {isEdit && (
        <Button label={removeGate.label} icon={removeGate.icon} hint={removeGate.hint} variant="dangerGhost" onPress={onRemove} disabled={!removeGate.allowed} />
      )}
    </AppSheet>
    <ConfirmSheet
      ref={confirmRef}
      icon="delete"
      title={`Remove the ${name} budget?`}
      // Says what removing it means: the spending stays, it stops being measured.
      body={`Its spending stays. It just stops being measured against a limit ${closed ? `in ${monthTitle(month)}` : "this month"}.`}
      confirmLabel="Remove budget"
      needsConnection
      onConfirm={confirmRemove}
    />
    </>
  );
});

BudgetLimitSheet.displayName = "BudgetLimitSheet";

const styles = StyleSheet.create({
  identity: {
    alignItems: "center",
    gap: 8,
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
