import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn } from "react-native-reanimated";
import { AppText } from "./AppText";
import { haptics } from "@/lib/haptics";
import { gradients, touchTarget } from "@/theme";

type Segment<T extends string> = {
  key: T;
  label: string;
  /** What VoiceOver says when the label is an abbreviation ("6M" → "6 months"). */
  accessibilityLabel?: string;
};

type Props<T extends string> = {
  segments: Segment<T>[];
  value: T;
  onChange: (key: T) => void;
  /** `sm` for a range or a pair of tabs inside a screen (Trends' 6M / 1Y / All time). */
  size?: "md" | "sm";
  /** Names the whole control for VoiceOver, e.g. "Range". */
  accessibilityLabel?: string;
};

// Segment heights before the slop: md 9 + 18 + 9, sm 6 + 16 + 6. The slop makes each 44.
const SIZE = {
  md: { padV: 9, text: "sm" as const, slop: (touchTarget - 36) / 2 },
  sm: { padV: 6, text: "xs" as const, slop: (touchTarget - 28) / 2 },
};

// Spec segmented control — one glass track; the selected segment carries the
// violet gradient + glow, the rest stay quiet inkDim labels on a single line.
// The pick-one-of-up-to-four control (D5 A); longer or scrolling sets are Chips.
const SegmentedControl = <T extends string>({ segments, value, onChange, size = "md", accessibilityLabel }: Props<T>) => {
  const s = SIZE[size];
  return (
    <View style={styles.track} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {segments.map((segment) => {
        const selected = segment.key === value;
        return (
          <Pressable
            key={segment.key}
            onPress={() => {
              if (selected) return; // re-picking the current segment changes nothing, so it says nothing
              haptics.select();
              onChange(segment.key);
            }}
            hitSlop={{ top: s.slop, bottom: s.slop }}
            accessibilityRole="tab"
            accessibilityLabel={segment.accessibilityLabel ?? segment.label}
            accessibilityState={{ selected }}
            style={[styles.segment, { paddingVertical: s.padV }, selected && styles.segmentOn]}
          >
            {selected && (
              // Fades in on the segment it moved to rather than hard-cutting. Not a
              // sliding pill: the track is laid out by flex, so a slider would need
              // measured positions to stay honest at any label length.
              <Animated.View entering={FadeIn.duration(160)} style={styles.fill}>
                <LinearGradient
                  colors={[...gradients.brand]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={styles.fill}
                />
              </Animated.View>
            )}
            <AppText
              size={s.text}
              weight={selected || size === "sm" ? "bold" : "semibold"}
              color={selected ? "surface" : "inkDim"}
              numberOfLines={1}
            >
              {segment.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 4,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  segmentOn: {
    shadowColor: "#6D5CFF",
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
  },
});

export default SegmentedControl;
