import { InputAccessoryView, Keyboard, Platform, StyleSheet, View } from "react-native";
import { AppText } from "./AppText";
import PressableScale from "./PressableScale";
import { spacing } from "@/theme";

/** Hand to a field's `inputAccessoryViewID` to give it the bar. */
export const KEYBOARD_DONE_ID = "sns-keyboard-done";

/**
 * A Done strip pinned to the top of the keyboard, mounted once at the root and addressed
 * by id from every field.
 *
 * Number pads are why it exists: a decimal-pad has no return key, so the only way out of
 * an amount field was a swipe down — which the sheet underneath also reads as a close.
 *
 * iOS only. `inputAccessoryViewID` is ignored on Android, which already has a system back
 * gesture that closes the keyboard and nothing else.
 */
const KeyboardDoneBar = () => {
  if (Platform.OS !== "ios") return null;

  return (
    // Transparent, so the bar is the button and its own hairline rather than a slab of a
    // colour that has to match the keyboard's — which the user can change under us.
    <InputAccessoryView nativeID={KEYBOARD_DONE_ID} backgroundColor="transparent">
      <View style={styles.bar}>
        <PressableScale
          onPress={() => Keyboard.dismiss()}
          scaleTo={0.92}
          hitSlop={10}
          accessibilityLabel="Close keyboard"
          style={styles.button}
        >
          <AppText size="sm" weight="bold" color="primary">
            Done
          </AppText>
        </PressableScale>
      </View>
    </InputAccessoryView>
  );
};

const styles = StyleSheet.create({
  bar: {
    alignItems: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: "rgba(21,16,36,0.94)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
  },
  button: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
});

export default KeyboardDoneBar;
