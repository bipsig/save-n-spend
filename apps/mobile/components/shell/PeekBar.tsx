import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  FadeOutDown,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import { haptics } from "@/lib/haptics";
import { PEEK_MS, useSettings } from "@/store/settings";
import { radius, spacing } from "@/theme";

// The receipt for a peek, and its escape hatch.
//
// Revealing every amount at once is only safe if the user can see that it happened
// and how long it lasts — otherwise they'd have no way to know the app is currently
// showing their balances to the room. The draining line is the honest version of
// that: it says "ten seconds" without printing a number that ticks.
//
// Bottom of the screen, unlike Toast: this is a standing state rather than a
// message, and the top belongs to whatever the user is actually reading.
const PeekBar = () => {
  const peeking = useSettings((s) => s.peeking);
  const hide = useSettings((s) => s.hide);
  const { bottom } = useSafeAreaInsets();

  // 1 → 0 across the peek. Driven here rather than by a timer in JS so the drain
  // stays smooth while a list is scrolling or a fetch is resolving.
  const remaining = useSharedValue(1);

  useEffect(() => {
    if (!peeking) return;
    // Snapped back to full first: tapping a second amount restarts the store's
    // timer, so the line has to restart with it instead of continuing to drain.
    remaining.value = 1;
    remaining.value = withTiming(0, { duration: PEEK_MS, easing: Easing.linear });
  }, [peeking, remaining]);

  const drain = useAnimatedStyle(() => ({ flex: Math.max(remaining.value, 0.001) }));
  const spent = useAnimatedStyle(() => ({ flex: Math.max(1 - remaining.value, 0.001) }));

  if (!peeking) return null;

  return (
    <View style={[styles.position, { bottom: bottom + spacing.lg }]} pointerEvents="box-none">
      <Animated.View entering={SlideInDown.duration(240)} exiting={FadeOutDown.duration(180)}>
        <Pressable
          onPress={() => {
            haptics.toggle();
            hide();
          }}
          accessibilityRole="button"
          accessibilityLabel="Amounts are visible. Tap to hide them now."
        >
          <View style={styles.card}>
            <LinearGradient
              colors={["rgba(40,34,66,0.98)", "rgba(24,19,42,0.98)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.6, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.line}>
              <Icon name="eye" size={15} color="ink" />
              <AppText size="xs" weight="semibold" style={styles.label}>
                Amounts visible
              </AppText>
              {/* Spelled out rather than left to the draining line alone: the line
                  says "not for long", this says what to do about it. */}
              <AppText size="xs" weight="bold" color="accent">
                Hide
              </AppText>
            </View>

            {/* Two flexed halves rather than a percentage width, so the drain runs
                entirely on the UI thread without measuring the pill first. */}
            <View style={styles.track}>
              <Animated.View style={[styles.fill, drain]} />
              <Animated.View style={spent} />
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  position: {
    position: "absolute",
    left: 20, // matches Toast and the scaffold's screen padding
    right: 20,
  },
  card: {
    paddingTop: 10,
    paddingHorizontal: 13,
    paddingBottom: 10,
    gap: 9,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(155,140,255,0.40)", // the same violet hairline `info` uses
    overflow: "hidden",
    // Opaque and lifted, like Toast: it floats over arbitrary content.
    shadowColor: "#08060F",
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  label: {
    flex: 1,
  },
  track: {
    flexDirection: "row",
    height: 2,
    borderRadius: 1,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  fill: {
    backgroundColor: "#9B8CFF",
  },
});

export default PeekBar;
