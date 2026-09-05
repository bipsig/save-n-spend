import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { router } from "expo-router";
import { z } from "zod/v4";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AppText } from "@/components/ui/AppText";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import BackButton from "@/components/shell/BackButton";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import PasswordMeter from "@/components/ui/PasswordMeter";
import PressableScale from "@/components/ui/PressableScale";
import { spacing } from "@/theme";
import { haptics } from "@/lib/haptics";
import { post } from "@/lib/api";
import { deviceZone } from "@/lib/zone";
import { toast } from "@/store/toast";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
});

type FormValues = z.infer<typeof schema>;

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

  // register → on success go to login (kept separate; no auto-session).
  const onSubmit = handleSubmit(async (values) => {
    setAuthError(null);
    setSubmitting(true);
    try {
      // The phone's zone seeds the account's, so a new user's first month is cut
      // where they actually are instead of at the server's default. Sent only here:
      // it is a starting guess, and once the account has one, changing it is a
      // deliberate act in Settings — otherwise a week abroad would silently re-cut
      // every month of history.
      await post("/auth/register", { ...values, timeZone: deviceZone() });
      router.replace("/(auth)/login");
      // The screen is replaced by Login, which looks identical to the form the user
      // just filled in — so without this it reads as if the tap did nothing, or worse,
      // as if the account already existed. It also says what to do next.
      toast.success("Account created — sign in to get started");
    } catch (e) {
      // A taken email is the usual failure here, reported as one line of small red
      // text beneath a button the user is still watching. The buzz is what catches it.
      haptics.error();
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
                // Deep, like every other bare glyph: a 20px icon has no surface to shrink.
                <PressableScale
                  onPress={() => setShowPassword((s) => !s)}
                  scaleTo={0.88}
                  hitSlop={8}
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                >
                  <Icon name={showPassword ? "eyeOff" : "eye"} size={20} color="inkDim" />
                </PressableScale>
              }
            />
          )}
        />

        <PasswordMeter password={password} />
      </View>

      <Button
        label="Create account"
        onPress={onSubmit}
        loading={submitting}
        disabled={!isValid || submitting}
      />

      {authError && (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
          <AppText size="xs" color="danger">
            {authError}
          </AppText>
        </Animated.View>
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
        {/* The shared chevron — the last screen still carrying its own copy of it. */}
        <BackButton />
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
  terms: {
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: spacing.md,
  },
});
