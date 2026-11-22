import { useEffect } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import Card from "@/components/data/Card";
import { useServerWaking } from "@/lib/api";
import { radius, spacing, colors } from "@/theme";

/** The strip itself, in the offline banner's look, for a screen that places it inline. */
export const ServerWakingNotice = () => {
  const waking = useServerWaking((s) => s.waking);
  if (!waking) return null;

  // No button: lib/api.ts is already retrying, and the strip goes when the server answers.
  return (
    <Card padded={false} style={styles.card}>
      <Icon name="refresh" size={14} color="inkDim" />
      <AppText size="xs" color="inkDim" weight="semibold" style={styles.text}>
        The server is starting up · showing saved data
      </AppText>
    </Card>
  );
};

/** Mounted once at the root and draws nothing: the inline notice shows in every scaffold,
 *  so announcing from there would repeat once per mounted screen. VoiceOver has no other
 *  way to learn the figures are saved ones. */
export const ServerWakingAnnouncer = () => {
  const waking = useServerWaking((s) => s.waking);
  useEffect(() => {
    if (waking) AccessibilityInfo.announceForAccessibility("The server is starting up. Showing saved data.");
  }, [waking]);
  return null;
};

// Floating under the status bar like Toast under the status bar like Toast, so every screen gets
// it without opting in. Touches pass through to the header beneath; the plate is opaque
// because glass over a title is unreadable.
const ServerWakingStrip = () => {
  const { top } = useSafeAreaInsets();
  const waking = useServerWaking((s) => s.waking);
  if (!waking) return null;

  return (
    <View style={[styles.position, { top: top + spacing.sm }]} pointerEvents="none">
      <ServerWakingNotice />
    </View>
  );
};

const styles = StyleSheet.create({
  position: {
    position: "absolute",
    left: 20,
    right: 20,
    borderRadius: radius.lg,
    backgroundColor: colors.stripBg,
    shadowColor: colors.scrim,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  text: {
    flex: 1,
  },
});

export default ServerWakingStrip;
