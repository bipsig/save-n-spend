import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import AppSheet from "./AppSheet";
import { AppText } from "@/components/ui/AppText";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import Input from "@/components/ui/Input";
import PasswordMeter from "@/components/ui/PasswordMeter";
import PressableScale from "@/components/ui/PressableScale";
import { haptics } from "@/lib/haptics";
import { changePassword } from "@/lib/profile";
import { toast } from "@/store/toast";
import { spacing } from "@/theme";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string().min(1, "Repeat your new password"),
  })
  // Caught here rather than at the API: mistyping the confirmation is not a
  // server's business, and the error belongs on the field that owns it.
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: "Choose a password different from your current one",
    path: ["newPassword"],
  });

type Form = z.infer<typeof schema>;

const EMPTY: Form = { currentPassword: "", newPassword: "", confirmPassword: "" };

// Spec §08 — Change password (Tier-2). Only the account's own password: the
// current one is re-checked server-side, so knowing the session token is not
// enough to change it.
const ChangePasswordSheet = forwardRef<BottomSheetModal, { onChanged?: () => void }>(({ onChanged }, ref) => {
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const dismiss = () => innerRef.current?.dismiss();

  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { control, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: EMPTY,
  });

  const newPassword = useWatch({ control, name: "newPassword" }) ?? "";

  // Nothing typed here should survive the sheet closing.
  const clear = () => {
    reset(EMPTY);
    setReveal(false);
    setError(null);
  };

  const submit = handleSubmit(async (values) => {
    setError(null);
    try {
      await changePassword(values.currentPassword, values.newPassword);
      onChanged?.();
      clear();
      dismiss();
      // The one save in the app with nothing on screen to show for it — the fields
      // are wiped by design, so without this the user has no idea whether it took.
      toast.success("Password changed");
    }
    catch (err) {
      haptics.error();
      setError(err instanceof Error ? err.message : "Couldn't change your password. Try again.");
    }
  });

  // Deep, like every other bare glyph: a 20px icon has no surface to shrink.
  const eye = (
    <PressableScale
      onPress={() => setReveal((s) => !s)}
      scaleTo={0.88}
      hitSlop={8}
      accessibilityLabel={reveal ? "Hide passwords" : "Show passwords"}
    >
      <Icon name={reveal ? "eyeOff" : "eye"} size={20} color="inkDim" />
    </PressableScale>
  );

  return (
    <AppSheet
      ref={innerRef}
      onDismiss={clear}
      scrollable
      footer={<Button label="Change password" loading={isSubmitting} onPress={submit} />}
    >
      <View style={styles.identity}>
        <Icon name="lock" size={24} containerSize={52} container="square" gradient="violet" />
        <View style={styles.identityText}>
          <AppText size="md" weight="black">
            Change password
          </AppText>
          <AppText size="sm" color="inkDim">
            You&apos;ll stay signed in on this device.
          </AppText>
        </View>
      </View>

      <Controller
        control={control}
        name="currentPassword"
        render={({ field: { value, onChange, onBlur } }) => (
          <Input
            label="Current password"
            placeholder="••••••••"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.currentPassword?.message}
            autoCapitalize="none"
            secureTextEntry={!reveal}
            InputComponent={BottomSheetTextInput}
            rightSlot={eye}
          />
        )}
      />

      <View style={styles.block}>
        <Controller
          control={control}
          name="newPassword"
          render={({ field: { value, onChange, onBlur } }) => (
            <Input
              label="New password"
              placeholder="••••••••"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.newPassword?.message}
              autoCapitalize="none"
              secureTextEntry={!reveal}
              InputComponent={BottomSheetTextInput}
            />
          )}
        />
        <PasswordMeter password={newPassword} />
      </View>

      <Controller
        control={control}
        name="confirmPassword"
        render={({ field: { value, onChange, onBlur } }) => (
          <Input
            label="Confirm new password"
            placeholder="••••••••"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.confirmPassword?.message}
            autoCapitalize="none"
            secureTextEntry={!reveal}
            InputComponent={BottomSheetTextInput}
          />
        )}
      />

      {error && (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
          <AppText size="sm" color="danger">
            {error}
          </AppText>
        </Animated.View>
      )}
    </AppSheet>
  );
});

ChangePasswordSheet.displayName = "ChangePasswordSheet";

const styles = StyleSheet.create({
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  identityText: {
    flex: 1,
    gap: 3,
  },
  block: {
    gap: spacing.sm,
  },
});

export default ChangePasswordSheet;
