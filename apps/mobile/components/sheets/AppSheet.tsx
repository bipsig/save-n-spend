import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { ScrollView } from "react-native";
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
  /** Fixed heights (e.g. ["78%"]), so the sheet reads as nested over whatever opened it
   * instead of growing to near-full-height. When set, dynamic sizing is off. */
  snapPoints?: Array<string | number>;
  /** Pinned to the bottom, above the scroll and the keyboard — for CTAs that
   * must stay reachable while the body scrolls. */
  footer?: React.ReactNode;
  /** Change this to send the body back to the top. Only needed by sheets that swap content
   * in place, since the scroll offset survives a change of children. Reopening is already
   * handled. */
  scrollResetKey?: string | number;
};

// Elevated violet surface (NOT white glass — a form needs legibility). gorhom fills this
// with the sheet's rounded container; we paint the gradient and lit top edge into it.
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

// A sheet mounts on the next frame and then springs in, so for a moment after the tap
// nothing acknowledges it and taps land again — and gorhom drops a re-`present()` of a
// sheet its queue already holds, leaving it registered at a stale position it can surface
// from later. So presenting is idempotent: ignored while this sheet is up, and for the
// length of its close animation.
const REPRESENT_GUARD_MS = 400;

const AppSheet = forwardRef<BottomSheetModal, Props>(({ children, onDismiss, scrollable, snapPoints, footer, scrollResetKey }, ref) => {
  const { bottom } = useSafeAreaInsets();
  const [footerHeight, setFooterHeight] = useState(0);

  const modalRef = useRef<BottomSheetModal>(null);
  const scrollRef = useRef<ScrollView>(null);
  const presented = useRef(false);
  const closedAt = useRef(0);

  // Never animated: the content has just changed or is off-screen, so a smooth scroll
  // would either race the new layout or be a slide nobody is watching.
  const resetScroll = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  // Content swapped in place. Runs on mount too, which is a no-op.
  useEffect(resetScroll, [scrollResetKey, resetScroll]);

  const present = useCallback<BottomSheetModal["present"]>((data) => {
    if (presented.current || Date.now() - closedAt.current < REPRESENT_GUARD_MS) return;
    presented.current = true;
    modalRef.current?.present(data);
  }, []);

  // gorhom funnels every dismissal through this callback, so it is the one place the gate
  // can be lifted.
  const handleDismiss = useCallback(() => {
    presented.current = false;
    closedAt.current = Date.now();
    // A dismissed sheet stays mounted in gorhom's queue, so its ScrollView keeps the offset
    // it was left at and reopens part-way down. Reset here rather than on present, since
    // this fires after the close animation where the jump can't be seen.
    resetScroll();
    onDismiss?.();
  }, [onDismiss, resetScroll]);

  // Owners get this handle, not gorhom's — `present` is the gated one above.
  useImperativeHandle(ref, () => ({
    present,
    dismiss: (config) => modalRef.current?.dismiss(config),
    snapToIndex: (index, config) => modalRef.current?.snapToIndex(index, config),
    snapToPosition: (position, config) => modalRef.current?.snapToPosition(position, config),
    expand: (config) => modalRef.current?.expand(config),
    collapse: (config) => modalRef.current?.collapse(config),
    close: (config) => modalRef.current?.close(config),
    forceClose: (config) => modalRef.current?.forceClose(config),
  }), [present]);

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

  // Its own opaque bar, so scrolled content passes cleanly behind it; the scroll body pads
  // itself by the measured height.
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
      ref={modalRef}
      onDismiss={handleDismiss}
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
          ref={scrollRef}
          contentContainerStyle={[styles.content, bodyPad]}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
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
