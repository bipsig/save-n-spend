import { useState } from "react";
import { Pressable, Share, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import { APP_VERSION, currentScreen, reportError } from "@/lib/errorReporting";
import { colors, spacing } from "@/theme";

type Props = {
  error: Error;
  retry: () => Promise<void>;
};

// What a screen that throws while rendering shows instead of the app closing. The error is
// reported once, when this first mounts, and the reference it was filed under is on screen —
// so "it broke" can come with "Ref 7K2QXB", which finds the exact error in the log.
//
// Two ways out, stacked: Try again for a one-off, Go to Home for a screen that fails every
// time (Try again alone would be a dead end). Share rather than Copy: the system share sheet
// has Copy in it, and it needs no native module.
//
// Built from plain parts: this can render in place of the root layout, outside every provider
// it sets up, so nothing here may need one.
const CrashScreen = ({ error, retry }: Props) => {
  // Lazy initial state: reported exactly once per crash, not on every re-render.
  const [ref] = useState(() => reportError(error));
  const [screen] = useState(() => currentScreen());
  const [open, setOpen] = useState(false);

  const share = () => {
    void Share.share({
      message: `Save n Spend error · Ref ${ref}\n${error.message}\non ${screen} · v${APP_VERSION}`,
    });
  };

  const goHome = async () => {
    await retry();
    router.replace("/(tabs)");
  };

  return (
    <View style={styles.wrap}>
      <Icon name="info" size={26} container="square" containerSize={60} containerRadius={20} gradient="red" />
      <AppText size="lg" weight="black" style={styles.center}>Something went wrong</AppText>
      <AppText size="sm" color="inkDim" style={[styles.center, styles.lh]}>
        This screen hit an error and it&apos;s been reported.
      </AppText>

      <View style={styles.details}>
        <View style={styles.refLine}>
          <AppText size="md" weight="black" selectable style={styles.ref}>Ref {ref}</AppText>
          <Pressable onPress={share} hitSlop={10} accessibilityRole="button" accessibilityLabel="Share the error reference">
            <AppText size="xs" weight="black" color="primary">Share</AppText>
          </Pressable>
        </View>
        <Pressable onPress={() => setOpen((o) => !o)} style={styles.toggle} accessibilityRole="button" accessibilityState={{ expanded: open }}>
          <AppText size="xs" weight="bold" color="inkDim">{open ? "▾ Details" : "▸ Details"}</AppText>
        </Pressable>
        {open && (
          <View style={styles.detailBody}>
            <AppText size="xs" color="inkSecondary" selectable style={styles.mono}>{error.message || error.name}</AppText>
            <AppText size="xs" color="inkDim" style={styles.mono}>on {screen} · v{APP_VERSION}</AppText>
          </View>
        )}
      </View>

      <View style={styles.buttons}>
        <Pressable onPress={() => { void retry(); }} style={({ pressed }) => [styles.button, styles.primary, pressed && styles.pressed]} accessibilityRole="button">
          <AppText size="sm" weight="bold">Try again</AppText>
        </Pressable>
        <Pressable onPress={() => { void goHome(); }} style={({ pressed }) => [styles.button, styles.secondary, pressed && styles.pressed]} accessibilityRole="button">
          <AppText size="sm" weight="bold">Go to Home</AppText>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.bg,
  },
  center: { textAlign: "center" },
  lh: { lineHeight: 20 },
  details: {
    alignSelf: "stretch",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  refLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  ref: { letterSpacing: 2 },
  toggle: { paddingVertical: 2 },
  detailBody: { gap: 4, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.07)" },
  mono: { fontFamily: "Menlo", lineHeight: 16 },
  buttons: { alignSelf: "stretch", gap: spacing.sm, marginTop: spacing.sm },
  button: { alignItems: "center", paddingVertical: 14, borderRadius: 999, borderWidth: 1 },
  primary: { backgroundColor: colors.accentSoft, borderColor: colors.primary },
  secondary: { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.12)" },
  pressed: { opacity: 0.7 },
});

export default CrashScreen;
