import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { z } from "zod/v4";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import type { IBill } from "@save-n-spend/types";
import AppSheet from "./AppSheet";
import CategoryPickerSheet from "./CategoryPickerSheet";
import BackButton from "@/components/shell/BackButton";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import Icon from "@/components/ui/Icon";
import { KEYBOARD_DONE_ID } from "@/components/ui/KeyboardDoneBar";
import PressableScale from "@/components/ui/PressableScale";
import Toggle from "@/components/ui/Toggle";
import DateField from "@/components/ui/DateField";
import AmountHeroInput from "@/components/ui/AmountHeroInput";
import { AppText } from "@/components/ui/AppText";
import { useCategoryById } from "@/lib/categories";
import { haptics } from "@/lib/haptics";
import { updateBill } from "@/lib/bills";
import { parseMoney } from "@/lib/money";
import { startOfToday, toZonedDayISO } from "@/lib/date";
import { post } from "@/lib/api";
import { toast } from "@/store/toast";
import type { IconName } from "@/lib/icons";
import { colors, spacing } from "@/theme";
import type { ColorToken } from "@/theme";

/** The lead time the "remind me" switch stands for. 0 is how the server says "don't". */
const REMIND_DAYS = 3;

type Props = {
  /** The bill being edited, or `null` to add a new one. */
  bill: IBill | null;
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

// The amount goes back as a plain rupee string because that is what the field edits;
// `parseMoney` turns it into paise again on submit.
const defaults = (bill: IBill | null): FormValues => ({
  name: bill?.name ?? "",
  amount: bill ? (bill.amount / 100).toFixed(2).replace(/\.00$/, "") : "",
  frequency: bill ? (bill.recurring ? bill.frequency ?? "monthly" : "once") : "monthly",
  category: bill?.category ?? "",
  dueDate: bill ? new Date(bill.dueDate) : startOfToday(),
  remind: bill ? (bill.reminderDays ?? REMIND_DAYS) > 0 : true,
});

// One sheet for both, like EditCategorySheet: the fields are identical and `bill` being
// null is the only difference. Adding a bill is a Tier-2 sheet rather than a route
// because none of its fields needs the full height a goal's numpad and grids do.
const EditBillSheet = forwardRef<BottomSheetModal, Props>(({ bill, onChanged }, ref) => {
  // Own handle, so `dismiss` closes this form and not the category picker it opens
  // on top of itself (see CategoryPickerSheet).
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const dismiss = () => innerRef.current?.dismiss();

  const pickerRef = useRef<BottomSheetModal>(null);

  const editing = bill !== null;
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
    defaultValues: defaults(null),
  });

  // Load whichever bill the sheet was opened on, so a second bill never shows the
  // first one's amount. The dismiss handler resets to this same bill rather than to
  // blank, which is what makes reopening the SAME row work — `bill` wouldn't change,
  // so this effect wouldn't fire to put the values back.
  useEffect(() => {
    reset(defaults(bill));
    setError(null);
  }, [bill, reset]);

  const category = useCategoryById(watch("category"));

  const onSubmit = async (data: FormValues) => {
    const recurring = data.frequency !== "once";
    const name = data.name.trim();
    const body = {
      name,
      amount: parseMoney(data.amount),
      category: data.category,
      dueDate: toZonedDayISO(data.dueDate),
      recurring,
      ...(recurring ? { frequency: data.frequency as "monthly" | "yearly" } : {}),
      // Always sent, unlike a bare omission: turning the switch off has to overwrite
      // the lead already stored, or the bill keeps nudging.
      reminderDays: data.remind ? REMIND_DAYS : 0,
    };

    setSubmitting(true);
    setError(null);
    try {
      if (bill) await updateBill(bill._id, body);
      else await post("/bills", body);
      dismiss();
      onChanged();
      // Named, not just "Bill added": the sheet closes onto a list the row may have
      // scrolled out of, and the name is what makes it findable.
      toast.success(editing ? `${name} updated` : `${name} added to your bills`);
    }
    catch (err) {
      // Kept in the sheet rather than toasted: the amount and name the user typed are
      // still in the fields, and the reason belongs beside them. The buzz is what
      // makes it noticeable without a banner.
      haptics.error();
      setError(err instanceof Error ? err.message : `Couldn't ${editing ? "save" : "add"} the bill`);
    }
    finally {
      setSubmitting(false);
    }
  };

  return (
    <>
    <AppSheet ref={innerRef} onDismiss={() => { reset(defaults(bill)); setError(null); }}>
      <View style={styles.header}>
        <AppText size="md" weight="black">
          {editing ? "Edit Bill" : "Add Bill"}
        </AppText>
        {/* Dismisses this sheet rather than going back — the shared button's default
            would pop the screen underneath it. */}
        <BackButton variant="close" onPress={dismiss} />
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
              returnKeyType="done"
              inputAccessoryViewID={KEYBOARD_DONE_ID}
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

      {/* No floor while editing: an existing bill's due date is often already past,
          and a picker that refuses to show it can't be corrected. */}
      <Controller
        control={control}
        name="dueDate"
        render={({ field: { value, onChange } }) => (
          <DateField
            label={editing ? "NEXT DUE" : "FIRST DUE"}
            value={value}
            onChange={onChange}
            minimumDate={editing ? undefined : startOfToday()}
          />
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

      <PressableScale style={styles.selRow} onPress={() => pickerRef.current?.present()} scaleTo={0.98}>
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
      </PressableScale>

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
                {`${REMIND_DAYS} days before · notification only, money never moves`}
              </AppText>
            </View>
            <Toggle value={value} onValueChange={onChange} />
          </View>
        )}
      />

      {(errors.name || errors.amount || errors.category || error) && (
        <AppText size="xs" color="danger">
          {errors.name?.message ?? errors.amount?.message ?? errors.category?.message ?? error}
        </AppText>
      )}

      <Button
        label={editing ? "Save Changes" : "Add Bill"}
        onPress={handleSubmit(onSubmit)}
        loading={submitting}
        disabled={!isValid}
      />
    </AppSheet>

    <CategoryPickerSheet
      ref={pickerRef}
      kind="expense"
      onPick={(categoryId) => setValue("category", categoryId, { shouldValidate: true })}
    />
    </>
  );
});

EditBillSheet.displayName = "EditBillSheet";

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

export default EditBillSheet;
