import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppText } from "./AppText";
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
          onPress={() => onChange(segment.key)}
          style={[styles.segment, selected && styles.segmentOn]}
        >
          {selected && (
            <LinearGradient
              colors={[...gradients.brand]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.fill}
            />
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
