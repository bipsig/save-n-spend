import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { z } from "zod/v4";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AppText } from "@/components/ui/AppText";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { gradients, spacing } from "@/theme";
import { useSession } from "@/store/session";
import { get, post } from "@/lib/api";
import type { IUser } from "@save-n-spend/types";

const schema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
});

type FormValues = z.infer<typeof schema>;

const LoginForm = () => {
  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { email: "", password: "" },
  });

  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const signIn = useSession((s) => s.signIn);
  const setUser = useSession((s) => s.setUser);

  // login → persist token → fetch the full user → become authed.
  // No navigation here: setUser flips status and the root gate swaps to the tabs.
  const onSubmit = handleSubmit(async (values) => {
    setAuthError(null);
    setSubmitting(true);
    try {
      const { accessToken } = await post<{ accessToken: string }>("/auth/login", values);
      await signIn(accessToken);
      const me = await get<IUser>("/auth/me");
      setUser(me);
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

      <Pressable onPress={() => console.log("forgot password")} hitSlop={6} style={styles.forgot}>
        <AppText size="sm" color="inkDim">Forgot password?</AppText>
      </Pressable>

      <Button
        label="Log in"
        onPress={onSubmit}
        loading={submitting}
        disabled={!isValid || submitting}
      />

      {authError && (
        <AppText size="xs" color="danger">
          {authError}
        </AppText>
      )}

      <View style={styles.divider}>
        <View style={styles.line} />
        <AppText size="xs" weight="bold" color="inkDim">OR</AppText>
        <View style={styles.line} />
      </View>

      <Button
        variant="ghost"
        label="Create an account"
        onPress={() => router.push("/(auth)/register")}
      />
    </View>
  );
};

const Login = () => (
  <ScreenScaffold
    header={
      <View style={styles.authhead}>
        <LinearGradient
          colors={[...gradients.brand]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.logomark}
        >
          <AppText size="2xl" weight="black" color="surface">₹</AppText>
        </LinearGradient>
        <AppText size="2xl" weight="black">Save n Spend</AppText>
        <AppText color="inkDim">Know where every rupee goes</AppText>
      </View>
    }
  >
    <LoginForm />
  </ScreenScaffold>
);

export default Login;

const styles = StyleSheet.create({
  authhead: {
    alignItems: "center",
    gap: spacing.xs,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  logomark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
    // Violet halo, same recipe as the primary Button glow.
    shadowColor: "#6D5CFF",
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  form: {
    gap: spacing.lg,
  },
  forgot: {
    alignSelf: "flex-end",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.09)",
  },
});
