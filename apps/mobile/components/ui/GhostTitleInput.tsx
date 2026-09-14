import { StyleSheet, TextInput, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { AppText } from "./AppText";
import Icon from "./Icon";
import PressableScale from "./PressableScale";
import { KEYBOARD_DONE_ID } from "./KeyboardDoneBar";
import { haptics } from "@/lib/haptics";
import { colors, fontSize, spacing } from "@/theme";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  error?: string;
  /** The rest of the best PREFIX match — never a middle-of-string one, since there is
   *  no way to visually "complete" a match that doesn't start where the cursor is. Null
   *  when nothing qualifies. */
  ghostSuffix: string | null;
  onAcceptGhost: () => void;
};

/**
 * A completion offered INSIDE the field, faded, the way a browser address bar completes
 * a typed URL — swipe right, tap the ghosted text, or tap the arrow to take it. Never
 * just the swipe: that gesture is unreachable by VoiceOver and easy to miss the first
 * time, so a plain tap works everywhere the swipe does.
 *
 * The ghost is a second Text layer UNDER the real TextInput, not a placeholder or a
 * second value — the typed portion is rendered transparent purely to reserve its exact
 * width, so the grey suffix starts exactly where the real cursor sits. Font size, weight
 * and padding are hand-matched between the two layers rather than shared from one
 * source, because a TextInput and a Text do not center a line of text identically on
 * every platform — worth a look on a real device if the two ever drift.
 */
const GhostTitleInput = ({ value, onChangeText, onBlur, placeholder, error, ghostSuffix, onAcceptGhost }: Props) => {
  const accept = () => {
    if (!ghostSuffix) return;
    haptics.select();
    onAcceptGhost();
  };

  // Layered over a live TextInput, so this has to let a normal tap or a short drag
  // (placing the cursor, selecting text) fall through untouched and only claim a
  // decisive rightward flick. `enabled` false with nothing to accept means the input
  // is never fought over when there is no ghost to take.
  const swipe = Gesture.Pan()
    .enabled(!!ghostSuffix)
    .activeOffsetX(30)
    .failOffsetY([-15, 15])
    .onEnd((e) => {
      if (e.translationX > 30 && e.velocityX > 250) runOnJS(accept)();
    });

  const borderColor = error ? colors.danger : colors.line;

  return (
    <View style={styles.wrapper}>
      <GestureDetector gesture={swipe}>
        <View style={[styles.field, { borderColor }]}>
          <View style={styles.ghostLayer} pointerEvents="none">
            <AppText numberOfLines={1} style={styles.ghostText}>
              <AppText style={styles.typed}>{value}</AppText>
              {ghostSuffix ? <AppText color="inkDim">{ghostSuffix}</AppText> : null}
            </AppText>
          </View>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            onBlur={onBlur}
            placeholder={placeholder}
            placeholderTextColor={colors.gray400}
            style={[styles.input, ghostSuffix ? styles.inputWithAccept : null]}
            inputAccessoryViewID={KEYBOARD_DONE_ID}
          />
          {/* The tappable fallback — same accept path as the swipe, reachable by anyone
              who can't or would rather not swipe a text field. */}
          {ghostSuffix && (
            <PressableScale style={styles.accept} onPress={accept} scaleTo={0.85} hitSlop={8}>
              <Icon name="chevronRight" size={18} color="primary" />
            </PressableScale>
          )}
        </View>
      </GestureDetector>
      {error && (
        <AppText size="xs" color="danger">
          {error}
        </AppText>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
    width: "100%",
  },
  field: {
    position: "relative",
    borderWidth: 1,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  ghostLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  ghostText: {
    fontSize: fontSize.md,
    fontWeight: "600",
  },
  typed: {
    color: "transparent",
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    fontWeight: "600",
    color: colors.ink,
    backgroundColor: "transparent",
  },
  // Room for the accept arrow, so a long ghosted suffix never runs under it.
  inputWithAccept: {
    paddingRight: 40,
  },
  accept: {
    position: "absolute",
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
});

export default GhostTitleInput;
