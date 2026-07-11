import { forwardRef, useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import type {
  BottomSheetBackdropProps,
  BottomSheetBackgroundProps,
} from "@gorhom/bottom-sheet";
import { spacing } from "@/theme";

type Props = {
  children: React.ReactNode;
  /** Fires after the sheet finishes dismissing (swipe, backdrop tap, or programmatic). */
  onDismiss?: () => void;
};

// Elevated violet surface (deliberately NOT white glass — a form needs legibility).
// gorhom fills this component with the sheet's rounded container; we paint the
// gradient + the 1px lit top edge into it.
const SheetBackground = ({ style }: BottomSheetBackgroundProps) => (
  <View style={[style, styles.bgClip]}>
    <LinearGradient
      colors={["#241E42", "#151024"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
    <View style={styles.topEdge} pointerEvents="none" />
  </View>
);

const AppSheet = forwardRef<BottomSheetModal, Props>(({ children, onDismiss }, ref) => {
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.55}
        style={[props.style, styles.scrim]}
      />
    ),
    []
  );

  return (
    <BottomSheetModal
      ref={ref}
      onDismiss={onDismiss}
      enableDynamicSizing
      backdropComponent={renderBackdrop}
      backgroundComponent={SheetBackground}
      handleIndicatorStyle={styles.grabber}
      handleStyle={styles.handle}
      // keyboard-aware: the sheet lifts with the keyboard and restores on blur
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      <BottomSheetView style={styles.content}>{children}</BottomSheetView>
    </BottomSheetModal>
  );
});

AppSheet.displayName = "AppSheet";

const styles = StyleSheet.create({
  bgClip: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: "hidden",
  },
  topEdge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.30)",
  },
  scrim: {
    backgroundColor: "#08060F",
  },
  handle: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xs,
    paddingBottom: spacing["2xl"],
    gap: spacing.lg,
  },
});

export default AppSheet;
