import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useLocalSearchParams } from "expo-router";
import { goBackOrHome } from "@/lib/navigation";
import { z } from "zod/v4";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import { AppText } from "@/components/ui/AppText";
import Caps from "@/components/ui/Caps";
import Icon from "@/components/ui/Icon";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Toggle from "@/components/ui/Toggle";
import IconPicker from "@/components/ui/IconPicker";
import ColorPicker from "@/components/ui/ColorPicker";
import DateField from "@/components/ui/DateField";
import ErrorState from "@/components/states/ErrorState";
import NotFoundState from "@/components/states/NotFoundState";
import SkeletonState from "@/components/states/SkeletonState";
import formatMoney, { parseMoney, usePrivacyMask } from "@/lib/money";
import { startOfToday, toZonedDayISO } from "@/lib/date";
import { formatCalendar, localCalendar } from "@/lib/format/date";
import { count } from "@/lib/format/count";
import { haptics } from "@/lib/haptics";
import { fetchGoal, updateGoal } from "@/lib/goals";
import { post } from "@/lib/api";
import { splitIssues } from "@/lib/apiError";
import { useIdempotencyKey } from "@/lib/useIdempotencyKey";
import { useOnlineGate } from "@/lib/onlineGate";
import { toast } from "@/store/toast";
import { NAME_MAX, NAME_MIN, type IGoal } from "@save-n-spend/types";
import type { IconName } from "@/lib/icons";
import { radius, spacing } from "@/theme";
import type { ColorToken } from "@/theme";
import { editWithUndo, previousValues } from "@/lib/undo";

const schema = z.object({
  name: z.string().min(NAME_MIN, "Name is required").max(NAME_MAX, `Keep it to ${NAME_MAX} characters`),
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

// Whole calendar months from today to the deadline — the unit people actually save in.
// Floored at 1, so a deadline inside this month reads as one payment, not a divide by zero.
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

// Same route for both: an `id` means edit. The form needs the numpad and the icon and
// colour grids at full height, so a sheet would have to be a cut-down copy of this.
const AddGoal = () => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = Boolean(id);
  const [original, setOriginal] = useState<IGoal | null>(null);

  const [deadline, setDeadline] = useState<Date | null>(null);
  const [saved, setSaved] = useState(0);
  // Only ever true while editing; a new goal has nothing to wait for.
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    setError,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { name: "", amount: "", icon: "savings", color: "accent" },
  });
  const idem = useIdempotencyKey();

  // Loaded rather than passed through params, so the route also works from a deep link
  // or after the list behind it has gone. Nothing is rendered until it lands, so there
  // is no window in which typing could be clobbered by the reset.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const goal = await fetchGoal(id);
        if (cancelled) return;
        if (!goal) {
          setNotFound(true);
          return;
        }
        setOriginal(goal);
        reset({
          name: goal.name,
          amount: (goal.target / 100).toFixed(2).replace(/\.00$/, ""),
          icon: goal.icon ?? "savings",
          color: goal.color ?? "accent",
        });
        setSaved(goal.saved);
        setDeadline(goal.deadline ? new Date(goal.deadline) : null);
      }
      catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Couldn't load the goal");
      }
      finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, reset, attempt]);

  const amountRaw = watch("amount");
  const name = watch("name");
  const icon = watch("icon") as IconName;
  const color = watch("color") as ColorToken;
  const target = parseMoney(amountRaw);

  const setAmount = (next: string) => setValue("amount", next, { shouldValidate: true });

  // Ticks only when the figure changed, as in Add Transaction: a rejected key stays silent.
  const pressKey = (key: (typeof KEYS)[number]) => {
    const cur = amountRaw ?? "";
    if (key === "back") {
      if (cur === "") return;
      haptics.tap();
      setAmount(cur.slice(0, -1));
      return;
    }
    if (key === ".") {
      if (cur.includes(".")) return;
      haptics.tap();
      setAmount(cur === "" ? "0." : cur + ".");
      return;
    }
    const dot = cur.indexOf(".");
    if (dot !== -1 && cur.length - dot > 2) return; // max 2 decimals
    if (cur.replace(".", "").length >= 9) return; // sane upper bound
    haptics.tap();
    setAmount(cur === "0" ? key : cur + key); // a lone leading zero is replaced, not appended
  };

  // What's still to find, per month. Money already contributed doesn't need saving
  // again, so an edited goal paces the remainder — never the whole target.
  const remaining = Math.max(target - saved, 0);
  const months = deadline ? monthsUntil(deadline) : 0;
  const perMonth = months > 0 ? Math.ceil(remaining / months) : remaining;
  const paceLine =
    target > 0 && deadline
      ? remaining === 0
        ? "Already there — the target is covered."
        : `${formatMoney(perMonth)} a month for ${count(months, "month")}`
      : target > 0
        ? "Set a target date to see what it costs per month"
        : null;

  const onSubmit = async (data: FormValues) => {
    const name = data.name.trim();
    const fields = {
      name,
      target: parseMoney(data.amount),
      icon: data.icon,
      color: data.color,
    };
    const iso = deadline ? toZonedDayISO(deadline) : null;

    setSubmitting(true);
    setSubmitError(null);
    try {
      // Explicitly null on a PATCH, so switching the deadline off clears the one stored —
      // a PATCH ignores what it isn't sent. Create has nothing to clear and rejects null.
      let undo: { saved: object | null; sent: Record<string, unknown> } | null = null;
      if (id) {
        const sent = { ...fields, deadline: iso };
        undo = { saved: await updateGoal(id, sent), sent };
      }
      else {
        const body = { ...fields, ...(iso ? { deadline: iso } : {}) };
        await post("/goals", body, { idempotencyKey: idem.keyFor("POST", "/goals", body) });
      }
      idem.reset();
      goBackOrHome();
      // The receipt repeats the pace: the screen that worked it out is gone by now.
      const receipt = editing
        ? deadline
          ? `${name} updated — ${formatMoney(perMonth)} a month`
          : `${name} updated`
        : deadline
          ? `${name} started — ${formatMoney(perMonth)} a month`
          : `${name} started — ${formatMoney(remaining)} to go`;
      if (id && undo && original) {
        editWithUndo({ path: `/goals/${id}`, previous: previousValues(original, undo.sent, { deadline: null }), saved: undo.saved, message: receipt });
      }
      else toast.success(receipt);
    }
    catch (err) {
      // Kept on the screen, beside the name, target, icon and colour just chosen. The buzz
      // is what makes small red text at the bottom of a long form noticeable.
      haptics.error();
      const { byField, rest } = splitIssues(err, { name: "name", target: "amount" } as const, `Couldn't ${editing ? "save" : "create"} the goal`);
      for (const [field, message] of Object.entries(byField) as [keyof FormValues, string][]) setError(field, { message });
      setSubmitError(rest);
    }
    finally {
      setSubmitting(false);
    }
  };

  const saveGate = useOnlineGate("");

  // A modal: the ✕ instead of a back chevron, the same header in every state.
  const header = { title: editing ? "Edit goal" : "New goal", back: "close" as const };

  if (notFound) {
    return (
      <ScreenScaffold {...header}>
        <NotFoundState thing="goal" />
      </ScreenScaffold>
    );
  }

  if (loadError) {
    return (
      <ScreenScaffold {...header}>
        <ErrorState message={loadError} onRetry={() => setAttempt((n) => n + 1)} />
      </ScreenScaffold>
    );
  }

  // Nothing is drawn until the goal lands: rendering the form empty and filling it in
  // afterwards would overwrite anything typed in between.
  if (loading) {
    return (
      <ScreenScaffold {...header}>
        <SkeletonState height={96} borderRadius={radius.lg} />
        <SkeletonState height={56} borderRadius={radius.lg} />
        <SkeletonState height={120} borderRadius={radius.lg} />
        <SkeletonState height={200} borderRadius={radius.lg} />
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold {...header} scroll={false}>
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
          <Caps>Target</Caps>
          <View style={styles.heroRow}>
            <AppText size="lg" weight="bold" color="inkDim" style={styles.heroCur}>
              ₹
            </AppText>
            <AppText weight="black" style={styles.heroVal}>
              {formatAmountDisplay(amountRaw)}
            </AppText>
            <View style={styles.caret} />
          </View>
          {/* What's already in, so a target being lowered is judged against it rather
              than in the abstract. Only ever shown while editing — a new goal has none. */}
          {saved > 0 && (
            <AppText size="xs" color="inkDim">
              {target > 0 && target < saved
                ? `${formatMoney(saved)} already saved — below the new target`
                : `${formatMoney(saved)} already saved`}
            </AppText>
          )}
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
                <Caps>Icon</Caps>
                <IconPicker value={value as IconName} onChange={onChange} />
              </View>
            )}
          />

          <Controller
            control={control}
            name="color"
            render={({ field: { value, onChange } }) => (
              <View style={styles.field}>
                <Caps>Colour</Caps>
                <ColorPicker value={value as ColorToken} onChange={onChange} />
              </View>
            )}
          />

          {/* A deadline is optional — a goal without one is still a goal, it just
              has no pace to hold you to. */}
          <View style={styles.field}>
            <View style={styles.deadlineHead}>
              <Caps>Target date</Caps>
              {/* The shared Toggle, which carries the app-wide switch haptic — the raw
                  RN Switch this replaced had neither that nor the role tokens. */}
              <Toggle
                label="Target date"
                value={deadline !== null}
                onValueChange={(on) => setDeadline(on ? defaultDeadline() : null)}
              />
            </View>
            {/* Cross-fades between the date row and the "no deadline" line, so flipping
                the switch reads as one thing replacing another rather than a jump. */}
            {deadline ? (
              <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
                {/* No floor while editing: a goal's deadline may already have passed,
                    and a picker that refuses to show it can't be moved. */}
                <DateField
                  label="Deadline"
                  value={deadline}
                  onChange={setDeadline}
                  minimumDate={editing ? undefined : startOfToday()}
                />
              </Animated.View>
            ) : (
              <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
                <AppText size="xs" color="inkDim">
                  No deadline — contribute whenever you like.
                </AppText>
              </Animated.View>
            )}
          </View>
        </ScrollView>

        {/* Fixed bottom — numpad + create, always visible with the target above */}
        {submitError && (
          <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
            <AppText size="xs" color="danger">
              {submitError}
            </AppText>
          </Animated.View>
        )}

        <View style={styles.numpad}>
          {KEYS.map((key) => (
            // A plain Pressable, not PressableScale: a keypad is pressed fast, and a spring
            // still settling when the next digit lands reads as lag.
            <Pressable
              key={key}
              onPress={() => pressKey(key)}
              style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
              accessibilityRole="button"
              accessibilityLabel={key === "back" ? "Delete digit" : key === "." ? "Decimal point" : key}
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
            // `!(target > 0)` also catches NaN, which parseMoney returns for an empty field.
            !(target > 0)
              ? editing ? "Save goal" : "Create goal"
              : `${editing ? "Save" : "Create"} · ${formatMoney(target)}`
                // The picker's own day, not an instant: the wheels mean the device's calendar.
                + (deadline ? ` by ${formatCalendar(localCalendar(deadline), "dayYear")}` : "")
          }
          icon={saveGate.icon}
          hint={saveGate.hint}
          onPress={handleSubmit(onSubmit)}
          loading={submitting}
          disabled={!isValid || !saveGate.allowed}
        />
      </View>
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
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
