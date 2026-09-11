import { useCallback, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Gesture, type PanGesture } from "react-native-gesture-handler";
import Animated, {
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { haptics } from "@/lib/haptics";

/** Long enough that a scroll flick doesn't pick a row up, short enough to feel like a grab. */
const HOLD_MS = 180;
const SETTLE_MS = 160;
const SLIDE_MS = 160;

type Shared = {
  /** Index being held, or -1. */
  active: SharedValue<number>;
  /** Slot the held row is currently over. */
  hover: SharedValue<number>;
  dy: SharedValue<number>;
  /** Measured per item, so rows and whole cards can be dragged by the same maths. */
  heights: SharedValue<number[]>;
};

const offsetOf = (heights: number[], gap: number, index: number) => {
  "worklet";
  let y = 0;
  for (let i = 0; i < index; i++) y += (heights[i] ?? 0) + gap;
  return y;
};

const slotAt = (heights: number[], gap: number, center: number) => {
  "worklet";
  let y = 0;
  for (let i = 0; i < heights.length; i++) {
    const next = y + (heights[i] ?? 0) + gap;
    if (center < next) return i;
    y = next;
  }
  return heights.length - 1;
};

const spanOf = (heights: number[], gap: number) => {
  "worklet";
  let y = 0;
  for (let i = 0; i < heights.length; i++) y += (heights[i] ?? 0) + gap;
  return y - gap;
};

/** Where the held row lands once the set is committed — the sum of the heights above its slot. */
const restOf = (heights: number[], gap: number, from: number, to: number) => {
  "worklet";
  let y = 0;
  let seen = 0;
  for (let i = 0; i < heights.length && seen < to; i++) {
    if (i === from) continue;
    y += (heights[i] ?? 0) + gap;
    seen++;
  }
  return y;
};

type ItemProps = {
  index: number;
  gap: number;
  enabled: boolean;
  dragging: boolean;
  shared: Shared;
  onBegin: (index: number) => void;
  onDrop: (from: number, to: number) => void;
  onMeasure: (index: number, height: number) => void;
  render: (state: { dragging: boolean; gesture: PanGesture }) => React.ReactNode;
};

const DragItem = ({
  index,
  gap,
  enabled,
  dragging,
  shared,
  onBegin,
  onDrop,
  onMeasure,
  render,
}: ItemProps) => {
  const { active, hover, dy, heights } = shared;

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .activateAfterLongPress(HOLD_MS)
        .onStart(() => {
          active.value = index;
          hover.value = index;
          dy.value = 0;
          runOnJS(onBegin)(index);
        })
        .onUpdate((e) => {
          const hs = heights.value;
          const top = offsetOf(hs, gap, index);
          // Held inside the column: these lists sit in cards that clip, so a row dragged
          // past the end would slide out of sight while the finger kept going.
          const travel = Math.min(
            Math.max(e.translationY, -top),
            spanOf(hs, gap) - (hs[index] ?? 0) - top
          );
          dy.value = travel;

          const slot = slotAt(hs, gap, top + travel + (hs[index] ?? 0) / 2);
          if (slot !== hover.value) {
            hover.value = slot;
            runOnJS(haptics.select)();
          }
        })
        // Fires for a release and for a cancel alike, so a held row always lands somewhere.
        .onEnd(() => {
          const hs = heights.value;
          const to = hover.value;
          const delta = restOf(hs, gap, index, to) - offsetOf(hs, gap, index);
          // Settles into the slot first, then commits: committing at the finger's position
          // would jump the row the width of the gap it hasn't closed yet.
          dy.value = withTiming(delta, { duration: SETTLE_MS }, (done) => {
            if (done) runOnJS(onDrop)(index, to);
          });
        }),
    [active, dy, enabled, gap, heights, hover, index, onBegin, onDrop]
  );

  const style = useAnimatedStyle(() => {
    const a = active.value;
    if (a === -1) return { transform: [{ translateY: 0 }, { scale: 1 }], zIndex: 0 };
    if (a === index) {
      return { transform: [{ translateY: dy.value }, { scale: 1.015 }], zIndex: 20 };
    }

    // Everything between the row's old slot and its new one shifts by exactly the held
    // row's height, which is what makes variable-height items land correctly.
    const shift = (heights.value[a] ?? 0) + gap;
    const h = hover.value;
    let ty = 0;
    if (h > a && index > a && index <= h) ty = -shift;
    else if (h < a && index >= h && index < a) ty = shift;

    return {
      transform: [{ translateY: withTiming(ty, { duration: SLIDE_MS }) }, { scale: 1 }],
      zIndex: 0,
    };
  });

  return (
    <Animated.View
      // Only outside the mode, where a removed row still has to close its gap. During a drag
      // the transforms own every position, and a layout animation would re-slide the commit.
      layout={enabled ? undefined : LinearTransition.duration(200)}
      onLayout={(e) => onMeasure(index, e.nativeEvent.layout.height)}
      style={style}
    >
      {render({ dragging, gesture })}
    </Animated.View>
  );
};

type Props<T> = {
  items: T[];
  keyOf: (item: T) => string;
  /**
   * Off outside reorder mode, where the rows are plain content with their own presses.
   * A disabled list still renders its items — only the gestures and the transforms go.
   */
  enabled: boolean;
  /** The whole set in the order it was left in, front to back. */
  onReorder: (ids: string[]) => void;
  /** Attach `gesture` to the part of the row that should pick it up. */
  render: (item: T, index: number, state: { dragging: boolean; gesture: PanGesture }) => React.ReactNode;
  /** Vertical space between items; counted into the drop maths. */
  gap?: number;
  /** Lock the enclosing scroll while a row is held, or it drags the list instead. */
  onDragChange?: (dragging: boolean) => void;
};

/**
 * A hold-and-drag reorderable column.
 *
 * Items are measured rather than assumed to share a height, so the same list works for rows
 * inside a card and for whole cards. Its own component rather than a dependency:
 * react-native-draggable-flatlist is built on Reanimated 2's gesture hooks, and none of the
 * lists here is long enough to need virtualising.
 */
const DragList = <T,>({ items, keyOf, enabled, onReorder, render, gap = 0, onDragChange }: Props<T>) => {
  const active = useSharedValue(-1);
  const hover = useSharedValue(-1);
  const dy = useSharedValue(0);
  const heights = useSharedValue<number[]>([]);

  // JS-side mirror: layout arrives one item at a time, and a shared value has to be
  // reassigned whole to be seen on the UI thread.
  const measured = useRef<number[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const onMeasure = useCallback(
    (index: number, height: number) => {
      measured.current[index] = height;
      measured.current.length = items.length;
      heights.value = [...measured.current];
    },
    [heights, items.length]
  );

  const onBegin = useCallback(
    (index: number) => {
      haptics.press();
      setActiveIndex(index);
      onDragChange?.(true);
    },
    [onDragChange]
  );

  const onDrop = useCallback(
    (from: number, to: number) => {
      // Reset and commit in one tick: the row is already sitting in its new slot, so the
      // re-render that puts it there for real has nothing left to move.
      active.value = -1;
      hover.value = -1;
      dy.value = 0;
      setActiveIndex(null);
      onDragChange?.(false);

      if (from === to) return;
      const ids = items.map(keyOf);
      const [moved] = ids.splice(from, 1);
      ids.splice(to, 0, moved);
      onReorder(ids);
    },
    [active, dy, hover, items, keyOf, onDragChange, onReorder]
  );

  return (
    <View style={gap > 0 ? { gap } : undefined}>
      {items.map((item, index) => (
        <DragItem
          key={keyOf(item)}
          index={index}
          gap={gap}
          enabled={enabled}
          dragging={activeIndex === index}
          shared={{ active, hover, dy, heights }}
          onBegin={onBegin}
          onDrop={onDrop}
          onMeasure={onMeasure}
          render={(state) => render(item, index, state)}
        />
      ))}
    </View>
  );
};

export default DragList;
