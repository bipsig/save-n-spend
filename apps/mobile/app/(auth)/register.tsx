import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { z } from "zod/v4";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AppText } from "@/components/ui/AppText";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { colors, spacing } from "@/theme";
import type { ColorToken } from "@/theme";
import { post } from "@/lib/api";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
});

type FormValues = z.infer<typeof schema>;

// Client-only heuristic: length + character variety → a 0–4 score. Zod still
// gates at ≥ 8; the meter just encourages going beyond the gate.
const strengthOf = (pw: string): number => {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
};

// Indexed by score. `tip` nudges toward the next improvement.
const STRENGTH: { tip: string; color: ColorToken }[] = [
  { tip: "Use at least 8 characters", color: "danger" },
  { tip: "Weak — add upper & lower case", color: "danger" },
  { tip: "Fair — add a number", color: "warning" },
  { tip: "Good — add a symbol to make it strong", color: "warning" },
  { tip: "Strong password", color: "success" },
];

const RegisterForm = () => {
  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { name: "", email: "", password: "" },
  });

  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Live password value drives the strength meter without re-rendering the fields.
  const password = useWatch({ control, name: "password" }) ?? "";
  const score = strengthOf(password);
  const meter = STRENGTH[score];

  // register → on success go to login (kept separate; no auto-session).
  const onSubmit = handleSubmit(async (values) => {
    setAuthError(null);
    setSubmitting(true);
    try {
      await post("/auth/register", values);
      router.replace("/(auth)/login");
    } catch (e) {
      setAuthError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <View style={styles.form}>
      <Controller
        control={control}
        name="name"
        render={({ field: { value, onChange, onBlur } }) => (
          <Input
            label="Name"
            placeholder="Sagnik Das"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.name?.message}
            autoCapitalize="words"
            autoComplete="name"
          />
        )}
      />

      <Controller
        control={control}
        name="email"
        render={({ field: { value, onChange, onBlur } }) => (
          <Input
            label="Email"
            placeholder="sagnik@email.com"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.email?.message}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
        )}
      />

      <View style={styles.passwordBlock}>
        <Controller
          control={control}
          name="password"
          render={({ field: { value, onChange, onBlur } }) => (
            <Input
              label="Password"
              placeholder="••••••••"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.password?.message}
              autoCapitalize="none"
              secureTextEntry={!showPassword}
              rightSlot={
                <Pressable
                  onPress={() => setShowPassword((s) => !s)}
                  hitSlop={8}
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                >
                  <Icon name={showPassword ? "eyeOff" : "eye"} size={20} color="inkDim" />
                </Pressable>
              }
            />
          )}
        />

        {password.length > 0 && (
          <View style={styles.meter}>
            <View style={styles.meterTrack}>
              <View
                style={[
                  styles.meterFill,
                  { width: `${(score / 4) * 100}%`, backgroundColor: colors[meter.color] },
                ]}
              />
            </View>
            <AppText size="xs" weight="semibold" color={meter.color}>
              {meter.tip}
            </AppText>
          </View>
        )}
      </View>

      <Button
        label="Create account"
        onPress={onSubmit}
        loading={submitting}
        disabled={!isValid || submitting}
      />

      {authError && (
        <AppText size="xs" color="danger">
          {authError}
        </AppText>
      )}

      <AppText size="xs" color="inkDim" style={styles.terms}>
        By continuing you agree to the Terms of Service and Privacy Policy
      </AppText>
    </View>
  );
};

const Register = () => (
  <ScreenScaffold
    header={
      <View style={styles.head}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back">
          <Icon name="chevronLeft" size={28} color="ink" />
        </Pressable>
        <AppText size="xl" weight="black">Create account</AppText>
      </View>
    }
  >
    <RegisterForm />
  </ScreenScaffold>
);

export default Register;

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  form: {
    gap: spacing.lg,
  },
  passwordBlock: {
    gap: spacing.sm,
  },
  meter: {
    gap: spacing.xs,
  },
  meterTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.09)",
    overflow: "hidden",
  },
  meterFill: {
    height: "100%",
    borderRadius: 2,
  },
  terms: {
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: spacing.md,
  },
});
