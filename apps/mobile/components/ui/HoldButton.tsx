import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppText } from "./AppText";
import Icon from "./Icon";
import type { IconName } from "@/lib/icons";
import { haptics } from "@/lib/haptics";
import { colors, gradients, radius, spacing } from "@/theme";

type Props = {
  label: string;
  /** Shown while the finger is down, in place of `label`. */
  holdingLabel?: string;
  icon?: IconName;
  durationMs?: number;
  loading?: boolean;
  disabled?: boolean;
  onComplete: () => void;
};

// The one action that outranks a tap (spec §10: Delete account). A hold is not a
// harder tap — it is a second or so during which the consequence stays on screen
// and letting go is still free.
//
// The spec draws this as a ring that fills. Here the CTA sits in a sheet footer
// where a full-width bar is the shape already established, so the same "watch it
// fill, release to abort" affordance sweeps across the button instead.
const HoldButton = ({
  label,
  holdingLabel,
  icon,
  durationMs = 1500,
  loading = false,
  disabled = false,
  onComplete,
}: Props) => {
  const progress = useRef(new Animated.Value(0)).current;
  const [holding, setHolding] = useState(false);
  // The completion callback must not fire from a stale animation: `pressIn`
  // stamps the attempt, and only the callback matching the current stamp counts.
  const attempt = useRef(0);
  // The ticks that mark progress through the hold. Cleared on release so a cancelled
  // hold stops buzzing the instant the finger lifts.
  const ticks = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTicks = () => {
    ticks.current.forEach(clearTimeout);
    ticks.current = [];
  };

  useEffect(() => () => {
    progress.stopAnimation();
    clearTicks();
  }, [progress]);

  const start = () => {
    if (disabled || loading) return;
    const id = ++attempt.current;
    setHolding(true);
    progress.setValue(0);

    // A hold has to be felt to be understood — the bar alone leaves you guessing
    // how much longer. Two ticks on the way and a heavy one at the end turn the
    // wait into a countdown you can feel without watching.
    haptics.tap();
    clearTicks();
    ticks.current = [0.4, 0.75].map((at) =>
      setTimeout(() => haptics.tap(), durationMs * at)
    );

    Animated.timing(progress, {
      toValue: 1,
      duration: durationMs,
      useNativeDriver: false, // interpolating to a width percentage
    }).start(({ finished }) => {
      if (finished && id === attempt.current) {
        clearTicks();
        haptics.heavy(); // the point of no return, and the only Heavy in the app
        setHolding(false);
        onComplete();
      }
    });
  };

  // Released early — the whole point of the hold. Rewind rather than snap, so the
  // button visibly gives the progress back.
  const cancel = () => {
    attempt.current += 1;
    clearTicks();
    setHolding(false);
    Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: false }).start();
  };

  const fillWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={[styles.wrap, disabled && styles.disabled]}>
      <Pressable
        onPressIn={start}
        onPressOut={cancel}
        disabled={disabled || loading}
        style={styles.surface}
      >
        {/* The unfilled bar reads as a red outline, so the button looks dangerous
            before anything is held. */}
        <Animated.View style={[styles.fill, { width: fillWidth }]}>
          <LinearGradient
            colors={[...gradients.danger]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <View style={styles.content}>
          {icon && <Icon name={icon} size={19} color="danger" />}
          <AppText weight="bold" size="md" color={holding ? "surface" : "danger"}>
            {holding ? holdingLabel ?? "Keep holding…" : label}
          </AppText>
        </View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
  },
  disabled: {
    opacity: 0.45,
  },
  surface: {
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: "rgba(255,107,116,0.10)",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
});

export default HoldButton;
