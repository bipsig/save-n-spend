import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import AppSheet from "./AppSheet";
import { AppText } from "@/components/ui/AppText";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { haptics } from "@/lib/haptics";
import { initialsOf, updateProfile } from "@/lib/profile";
import { useSession } from "@/store/session";
import { toast } from "@/store/toast";
import { spacing } from "@/theme";

const schema = z.object({
  name: z.string().trim().min(2, "Give us at least two characters").max(60),
});

type Form = z.infer<typeof schema>;

// Spec §08 — Edit profile (Tier-2, PATCH /users/me). The avatar is initials from
// the name rather than an upload: there is no image store behind the API yet, so
// the honest version of "edit your avatar" is watching it follow what you type.
const EditProfileSheet = forwardRef<BottomSheetModal, { onSaved?: () => void }>(({ onSaved }, ref) => {
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const dismiss = () => innerRef.current?.dismiss();

  const user = useSession((s) => s.user);
  const [error, setError] = useState<string | null>(null);

  const { setValue, watch, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { name: user?.name ?? "" },
  });

  const name = watch("name");

  // Follow the stored name while the sheet is closed, so it always opens on what
  // is currently saved rather than a stale draft from a cancelled edit.
  useEffect(() => {
    if (!isSubmitting) setValue("name", user?.name ?? "");
  }, [user?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = handleSubmit(async (values) => {
    setError(null);
    try {
      await updateProfile({ name: values.name });
      onSaved?.();
      dismiss();
      // Toasted rather than left silent: the sheet closes over the profile card, so
      // the only other proof it worked is a name the user just typed themselves.
      toast.success("Profile updated");
    }
    catch (err) {
      // Kept in the sheet rather than toasted: the rejected name is still in the
      // field, and the reason belongs beside it, not in a banner that expires. The
      // buzz is what makes it noticeable without a banner.
      haptics.error();
      setError(err instanceof Error ? err.message : "Couldn't save your profile. Try again.");
    }
  });

  return (
    <AppSheet
      ref={innerRef}
      onDismiss={() => {
        // A cancelled edit shouldn't be there next time — the saved name should.
        setValue("name", user?.name ?? "");
        setError(null);
      }}
      footer={<Button label="Save profile" loading={isSubmitting} onPress={submit} />}
    >
      {/* Live identity preview — the initials update as the name is typed. */}
      <View style={styles.identity}>
        <Avatar initials={initialsOf(name)} size="lg" gradient />
        <View style={styles.identityText}>
          <AppText size="md" weight="black" numberOfLines={1}>
            {name.trim() || "Your name"}
          </AppText>
          <AppText size="xs" color="inkDim" numberOfLines={1}>
            {user?.email ?? ""}
          </AppText>
        </View>
      </View>

      <Input
        label="Name"
        placeholder="e.g. Sagnik Das"
        value={name}
        onChangeText={(text) => setValue("name", text, { shouldValidate: true })}
        error={errors.name?.message}
        autoCapitalize="words"
        InputComponent={BottomSheetTextInput}
      />

      <AppText size="xs" color="inkDim">
        Your email is how you sign in, so it can&apos;t be changed here.
      </AppText>

      {error && (
        <AppText size="sm" color="danger">
          {error}
        </AppText>
      )}
    </AppSheet>
  );
});

EditProfileSheet.displayName = "EditProfileSheet";

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
});

export default EditProfileSheet;
