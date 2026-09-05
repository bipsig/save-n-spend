import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeOutUp, SlideInUp } from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import type { IconName } from "@/lib/icons";
import { useToast, type ToastTone } from "@/store/toast";
import type { ChipTint } from "@/theme/gradients";
import { radius, spacing } from "@/theme";

// Per tone: the glyph, the chip tint, and the border that tints the glass. A red
// hairline is what makes a failure legible at a glance, before the sentence is read.
const LOOK: Record<ToastTone, { icon: IconName; tint: ChipTint; border: string }> = {
  success: { icon: "check", tint: "green", border: "rgba(52,224,161,0.42)" },
  error: { icon: "budgetOver", tint: "red", border: "rgba(255,107,116,0.45)" },
  // Amber and the budget-warning glyph, the same pair every over-80% row uses — so
  // "it saved, but look" reads as caution rather than as a failure.
  warning: { icon: "budgetWarning", tint: "amber", border: "rgba(255,177,92,0.45)" },
  info: { icon: "info", tint: "violet", border: "rgba(155,140,255,0.40)" },
};

// The app's transient feedback banner. It enters from the top rather than the
// bottom because the bottom belongs to the tab bar, the FAB, and every sheet
// footer — a message down there would land under the finger that caused it.
//
// Mounted once at the root and driven by the store, so a toast survives the
// navigation that a save often triggers: the screen that fired it can unmount
// while its message is still on screen.
const Toast = () => {
  const current = useToast((s) => s.current);
  const dismiss = useToast((s) => s.dismiss);
  const { top } = useSafeAreaInsets();

  if (!current) return null;

  const look = LOOK[current.tone];

  return (
    // `pointerEvents: box-none` on the positioner: the banner itself is tappable,
    // but the empty space beside it must stay transparent to touch, or an invisible
    // strip would eat taps on whatever is underneath.
    <View style={[styles.position, { top: top + spacing.sm }]} pointerEvents="box-none">
      {/* Keyed by id so a replacing toast is a new element — it re-runs the
          entrance instead of silently swapping its text. */}
      <Animated.View
        key={current.id}
        entering={SlideInUp.duration(260)}
        exiting={FadeOutUp.duration(180)}
      >
        <Pressable onPress={dismiss} accessibilityRole="alert" accessibilityLabel={current.message}>
          <View style={[styles.card, { borderColor: look.border }]}>
            <LinearGradient
              colors={["rgba(40,34,66,0.98)", "rgba(24,19,42,0.98)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.6, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <Icon
              name={look.icon}
              size={15}
              containerSize={28}
              containerRadius={9}
              container="square"
              gradient={look.tint}
            />
            <AppText size="xs" weight="semibold" style={styles.message}>
              {current.message}
            </AppText>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  position: {
    position: "absolute",
    left: 20, // matches the scaffold's screen padding, so it lines up with the cards
    right: 20,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
    // Opaque, unlike a Card: this floats over arbitrary content, and glass over a
    // busy chart is unreadable. The shadow is what lifts it off that content.
    shadowColor: "#08060F",
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  message: {
    flex: 1,
    lineHeight: 18,
  },
});

export default Toast;
