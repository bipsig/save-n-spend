import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn } from "react-native-reanimated";
import { AppText } from "./AppText";
import { haptics } from "@/lib/haptics";
import { gradients } from "@/theme";

type Segment<T extends string> = { key: T; label: string };

type Props<T extends string> = {
  segments: Segment<T>[];
  value: T;
  onChange: (key: T) => void;
};

// Spec segmented control — one glass track; the selected segment carries the
// violet gradient + glow, the rest stay quiet inkDim labels on a single line.
// Used for the Activity time range (and any small either/or switch).
const SegmentedControl = <T extends string>({ segments, value, onChange }: Props<T>) => (
  <View style={styles.track}>
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
          style={[styles.segment, selected && styles.segmentOn]}
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
            size="sm"
            weight={selected ? "bold" : "semibold"}
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
    paddingVertical: 9,
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
