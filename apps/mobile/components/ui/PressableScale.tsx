import { useCallback } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { haptics } from "@/lib/haptics";

type Props = Omit<PressableProps, "style"> & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** How far in to squeeze. Smaller targets need a deeper dip to read as movement. */
  scaleTo?: number;
  /** Fire the light "pressed" tick. Off where the action's own haptic would double up. */
  haptic?: boolean;
};

// Spring, not timing: a press should decelerate into place and settle, the way a
// physical key does. `damping` high enough that release doesn't overshoot into a
// visible bounce — this is meant to be felt more than seen.
const SPRING = { damping: 18, stiffness: 320, mass: 0.4 } as const;

// One node, not a styled child inside a bare Pressable. That earlier shape put the
// caller's `style` on an inner view while the touchable stayed unstyled — so a
// `flex: 1` handed to this component landed on a child of a box that had already
// sized itself to its content. In a column parent nothing showed (children stretch
// there anyway), but in a ROW parent the target collapsed and any `flex: 1` text
// inside it resolved to zero width and vanished. Animating the Pressable itself
// means layout and transform describe the same box, so they can't disagree.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// The app's press affordance. Everything tappable that isn't already a Button gets
// this, so a tap on a transaction row and a tap on a settings row answer the same
// way — a slight give under the finger and a light tick.
//
// Reanimated rather than `Pressable`'s `({ pressed })` callback: that re-renders
// the subtree on every touch, and these wrap whole cards. Here the scale lives on
// the UI thread, so the press stays smooth even mid-fetch on the JS thread.
const PressableScale = ({
  children,
  style,
  scaleTo = 0.97,
  haptic = true,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: Props) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePressIn = useCallback<NonNullable<PressableProps["onPressIn"]>>(
    (event) => {
      scale.value = withSpring(scaleTo, SPRING);
      // On press-IN, not on press: the tick confirms the touch registered, which is
      // information the user wants before the action's own result arrives.
      if (haptic) haptics.tap();
      onPressIn?.(event);
    },
    [scale, scaleTo, haptic, onPressIn]
  );

  const handlePressOut = useCallback<NonNullable<PressableProps["onPressOut"]>>(
    (event) => {
      scale.value = withSpring(1, SPRING);
      onPressOut?.(event);
    },
    [scale, onPressOut]
  );

  return (
    <AnimatedPressable
      onPressIn={disabled ? undefined : handlePressIn}
      onPressOut={disabled ? undefined : handlePressOut}
      disabled={disabled}
      style={[style, animatedStyle]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
};

export default PressableScale;
