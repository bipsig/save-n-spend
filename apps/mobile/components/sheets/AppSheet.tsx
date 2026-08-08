import { forwardRef, useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetScrollView,
  BottomSheetBackdrop,
  BottomSheetFooter,
} from "@gorhom/bottom-sheet";
import type {
  BottomSheetBackdropProps,
  BottomSheetBackgroundProps,
  BottomSheetFooterProps,
} from "@gorhom/bottom-sheet";
import { spacing } from "@/theme";

type Props = {
  children: React.ReactNode;
  /** Fires after the sheet finishes dismissing (swipe, backdrop tap, or programmatic). */
  onDismiss?: () => void;
  /** Long content (e.g. a full category grid) — scroll inside the sheet once it
   * hits its max height, so nothing at the bottom gets clipped. */
  scrollable?: boolean;
  /** Fixed heights (e.g. ["78%"]). Caps the sheet so it reads as nested over
   * whatever opened it and opens at a stable position instead of dynamically
   * growing to near-full-height. When set, dynamic sizing is off. */
  snapPoints?: Array<string | number>;
  /** Pinned to the bottom, above the scroll and the keyboard — for CTAs that
   * must stay reachable while the body scrolls. */
  footer?: React.ReactNode;
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

const AppSheet = forwardRef<BottomSheetModal, Props>(({ children, onDismiss, scrollable, snapPoints, footer }, ref) => {
  const { bottom } = useSafeAreaInsets();
  const [footerHeight, setFooterHeight] = useState(0);

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

  // Sticky footer sits on its own opaque bar so scrolled content passes cleanly
  // behind it; the scroll body pads itself by the footer's measured height.
  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props}>
        <View
          onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
          style={[styles.footer, { paddingBottom: bottom + spacing.md }]}
        >
          {footer}
        </View>
      </BottomSheetFooter>
    ),
    [footer, bottom]
  );

  const bodyPad = footer ? { paddingBottom: footerHeight + spacing.lg } : null;

  return (
    <BottomSheetModal
      ref={ref}
      onDismiss={onDismiss}
      stackBehavior="push"
      enableDynamicSizing={!snapPoints}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      backgroundComponent={SheetBackground}
      footerComponent={footer ? renderFooter : undefined}
      handleIndicatorStyle={styles.grabber}
      handleStyle={styles.handle}
      // keyboard-aware: the sheet lifts with the keyboard and restores on blur
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      {scrollable ? (
        <BottomSheetScrollView
          contentContainerStyle={[styles.content, bodyPad]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </BottomSheetScrollView>
      ) : (
        <BottomSheetView style={[styles.content, bodyPad]}>{children}</BottomSheetView>
      )}
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
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.sm,
    backgroundColor: "#151024",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
  },
});

export default AppSheet;
