import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import { z } from "zod/v4";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import IconPicker from "@/components/ui/IconPicker";
import ColorPicker from "@/components/ui/ColorPicker";
import DateField from "@/components/ui/DateField";
import formatMoney, { parseMoney } from "@/lib/money";
import { formatFullDate, startOfToday, toUtcDateISO } from "@/lib/date";
import { post } from "@/lib/api";
import type { IconName } from "@/lib/icons";
import { colors, spacing } from "@/theme";
import type { ColorToken } from "@/theme";

const schema = z.object({
  name: z.string().min(1, "Name is required").max(60, "Keep it under 60 characters"),
  amount: z
    .string()
    .regex(/^\s*₹?\s*[\d,]+(\.\d{1,2})?\s*$/, "Enter a valid amount")
    .refine((v) => parseMoney(v) > 0, "Enter a valid amount"),
  icon: z.string(),
  color: z.string(),
});

type FormValues = z.infer<typeof schema>;

const defaultDeadline = (): Date => {
  const d = startOfToday();
  d.setMonth(d.getMonth() + 6);
  return d;
};

// Whole calendar months from today to the deadline — the unit people actually
// save in. Floored at 1 so a deadline inside this month reads as one payment
// rather than dividing by zero.
const monthsUntil = (deadline: Date): number => {
  const now = startOfToday();
  const months =
    (deadline.getFullYear() - now.getFullYear()) * 12 + (deadline.getMonth() - now.getMonth());
  return Math.max(months, 1);
};

// Indian digit grouping for the hero figure: last 3, then pairs (12,34,567).
const groupINR = (digits: string): string => {
  if (digits.length <= 3) return digits;
  const parts: string[] = [digits.slice(-3)];
  let rest = digits.slice(0, -3);
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return parts.join(",");
};

const formatAmountDisplay = (raw: string): string => {
  if (!raw) return "0";
  const [int = "", dec] = raw.split(".");
  const grouped = groupINR(int) || "0";
  return dec !== undefined ? `${grouped}.${dec}` : grouped;
};

// Same numpad as Add Transaction — digits stream straight into the hero figure.
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;

const AddGoal = () => {
  const router = useRouter();

  const [deadline, setDeadline] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { name: "", amount: "", icon: "savings", color: "accent" },
  });

  const amountRaw = watch("amount");
  const name = watch("name");
  const icon = watch("icon") as IconName;
  const color = watch("color") as ColorToken;
  const target = parseMoney(amountRaw);

  const setAmount = (next: string) => setValue("amount", next, { shouldValidate: true });

  const pressKey = (key: (typeof KEYS)[number]) => {
    const cur = amountRaw ?? "";
    if (key === "back") {
      setAmount(cur.slice(0, -1));
      return;
    }
    if (key === ".") {
      if (cur.includes(".")) return;
      setAmount(cur === "" ? "0." : cur + ".");
      return;
    }
    const dot = cur.indexOf(".");
    if (dot !== -1 && cur.length - dot > 2) return; // max 2 decimals
    if (cur === "0") {
      setAmount(key); // replace a lone leading zero
      return;
    }
    if (cur.replace(".", "").length >= 9) return; // sane upper bound
    setAmount(cur + key);
  };

  // The pace line turns a target into a decision: what it costs per month to
  // actually hit it. Only meaningful once there's both a target and a deadline.
  const months = deadline ? monthsUntil(deadline) : 0;
  const paceLine =
    target > 0 && deadline
      ? `${formatMoney(Math.ceil(target / months))} a month for ${months} ${months === 1 ? "month" : "months"}`
      : target > 0
        ? "Set a target date to see what it costs per month"
        : null;

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await post("/goals", {
        name: data.name.trim(),
        target: parseMoney(data.amount),
        icon: data.icon,
        color: data.color,
        ...(deadline ? { deadline: toUtcDateISO(deadline) } : {}),
      });
      router.back();
    }
    catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Couldn't create the goal");
    }
    finally {
      setSubmitting(false);
    }
  };

  // Spec .shead — ✕ on the left, centered title, balancing spacer on the right.
  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Close">
        <Icon name="close" size={16} containerSize={32} container="circle" containerColor="glass" color="inkDim" />
      </Pressable>
      <AppText weight="black" size="lg">
        New Goal
      </AppText>
      <View style={styles.headerSpacer} />
    </View>
  );

  return (
    <ScreenScaffold header={header} scroll={false}>
      <View style={styles.body}>
        {/* Fixed top — the target and the numpad that fills it stay paired on
            screen; only the secondary fields between them scroll. */}
        <View style={styles.identity}>
          <Icon
            name={icon}
            size={26}
            containerSize={56}
            containerRadius={19}
            container="square"
            gradient={color}
          />
          <AppText size="sm" weight="bold" color={name.trim() ? "ink" : "inkDim"} numberOfLines={1}>
            {name.trim() || "Your new goal"}
          </AppText>
        </View>

        <View style={styles.heroAmt}>
          <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>
            TARGET
          </AppText>
          <View style={styles.heroRow}>
            <AppText size="lg" weight="bold" color="inkDim" style={styles.heroCur}>
              ₹
            </AppText>
            <AppText weight="black" style={styles.heroVal}>
              {formatAmountDisplay(amountRaw)}
            </AppText>
            <View style={styles.caret} />
          </View>
          {paceLine && (
            <AppText size="xs" color="inkDim">
              {paceLine}
            </AppText>
          )}
          {errors.amount && amountRaw !== "" && (
            <AppText size="xs" color="danger">
              {errors.amount.message}
            </AppText>
          )}
        </View>

        {/* Scrollable middle — name, look, target date */}
        <ScrollView
          style={styles.midScroll}
          contentContainerStyle={styles.midContent}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <Controller
            control={control}
            name="name"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                label="Name"
                placeholder="e.g. Europe Trip"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.name?.message}
              />
            )}
          />

          {/* Icon + colour — the same shared pickers as the new-category flow. */}
          <Controller
            control={control}
            name="icon"
            render={({ field: { value, onChange } }) => (
              <View style={styles.field}>
                <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>
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
                <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>
                  COLOUR
                </AppText>
                <ColorPicker value={value as ColorToken} onChange={onChange} />
              </View>
            )}
          />

          {/* A deadline is optional — a goal without one is still a goal, it just
              has no pace to hold you to. */}
          <View style={styles.field}>
            <View style={styles.deadlineHead}>
              <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>
                TARGET DATE
              </AppText>
              <Switch
                value={deadline !== null}
                onValueChange={(on) => setDeadline(on ? defaultDeadline() : null)}
                trackColor={{ false: colors.surface2, true: colors.primary }}
                thumbColor={colors.surface}
              />
            </View>
            {deadline ? (
              <DateField
                label="DEADLINE"
                value={deadline}
                onChange={setDeadline}
                minimumDate={startOfToday()}
              />
            ) : (
              <AppText size="xs" color="inkDim">
                No deadline — contribute whenever you like.
              </AppText>
            )}
          </View>
        </ScrollView>

        {/* Fixed bottom — numpad + create, always visible with the target above */}
        {submitError && (
          <AppText size="xs" color="danger">
            {submitError}
          </AppText>
        )}

        <View style={styles.numpad}>
          {KEYS.map((key) => (
            <Pressable
              key={key}
              onPress={() => pressKey(key)}
              style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
              accessibilityLabel={key === "back" ? "Delete digit" : key}
            >
              {key === "back" ? (
                <Icon name="backspace" size={20} color="inkDim" />
              ) : (
                <AppText size="lg" weight="bold" color={key === "." ? "inkDim" : "ink"}>
                  {key === "." ? "·" : key}
                </AppText>
              )}
            </Pressable>
          ))}
        </View>

        <Button
          label={
            target > 0
              ? deadline
                ? `Create · ${formatMoney(target)} by ${formatFullDate(deadline.toISOString())}`
                : `Create · ${formatMoney(target)}`
              : "Create Goal"
          }
          onPress={handleSubmit(onSubmit)}
          loading={submitting}
          disabled={!isValid}
        />
      </View>
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerSpacer: {
    width: 32, // balances the ✕ so the title sits centered
  },
  // Fixed top / scrollable middle / fixed bottom — keeps the target hero and the
  // numpad on screen together, whatever the middle fields do.
  body: {
    flex: 1,
    gap: spacing.md,
  },
  // Live preview of the icon + colour + name you're choosing below.
  identity: {
    alignItems: "center",
    gap: 8,
  },
  midScroll: {
    flex: 1,
  },
  midContent: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  field: {
    gap: spacing.sm,
  },
  fieldLabel: {
    letterSpacing: 1.3, // spec .flabel
  },
  heroAmt: {
    alignItems: "center",
    gap: 4,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  heroCur: {
    marginRight: 3,
    marginBottom: 14, // superscript ₹, like the spec
  },
  heroVal: {
    fontSize: 46, // spec .heroamt .val 38px × device scale
    letterSpacing: -1.4,
  },
  caret: {
    width: 3,
    height: 34,
    borderRadius: 2,
    marginLeft: 5,
    backgroundColor: "#A394FF",
    shadowColor: "#A394FF",
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  deadlineHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  numpad: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9, // spec .numpad gap × device scale
  },
  key: {
    flexGrow: 1,
    flexBasis: "30%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  keyPressed: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
});

export default AddGoal;
