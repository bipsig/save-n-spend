import { StyleSheet, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { AppText } from "./AppText";
import { chartLegend as L } from "@/theme";

export type LegendItem = {
  label: string;
  color: string;
  /** `dot` for areas and bars, `line` for lines and steps, `dashed` for a dashed line. */
  mark?: "dot" | "line" | "dashed";
  /** Drawn right-aligned after the label, such as a slice's share ("62.4%"). */
  value?: string;
};

type Props = {
  items: LegendItem[];
  /** `column` stacks one item per line, as beside a donut, so the values line up. */
  layout?: "row" | "column";
  style?: StyleProp<ViewStyle>;
};

const Mark = ({ color, mark = "dot" }: Pick<LegendItem, "color" | "mark">) => {
  if (mark === "dot") return <View style={[styles.dot, { backgroundColor: color }]} />;
  if (mark === "line") return <View style={[styles.line, { backgroundColor: color }]} />;
  return (
    <View style={styles.dashed}>
      <View style={[styles.dash, { backgroundColor: color }]} />
      <View style={[styles.dash, { backgroundColor: color }]} />
    </View>
  );
};

const spoken = (i: LegendItem) => (i.value ? `${i.label} ${i.value}` : i.label);

// The one chart legend. VoiceOver reads it as one element ("Legend: Value, Invested").
const ChartLegend = ({ items, layout = "row", style }: Props) => {
  const column = layout === "column";
  return (
    <View style={[column ? styles.column : styles.row, style]} accessible accessibilityLabel={`Legend: ${items.map(spoken).join(", ")}`}>
      {items.map((item) => (
        <View key={item.label} style={[styles.item, column && styles.columnItem]}>
          <Mark color={item.color} mark={item.mark} />
          {column ? (
            <AppText size="sm" weight="semibold" numberOfLines={1} style={styles.grow}>
              {item.label}
            </AppText>
          ) : (
            <AppText size="xs" color="inkDim">
              {item.label}
            </AppText>
          )}
          {item.value !== undefined && (
            <AppText size="xs" weight="bold" color="inkDim">
              {item.value}
            </AppText>
          )}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", columnGap: L.itemGap, rowGap: 6 },
  column: { gap: 8 },
  item: { flexDirection: "row", alignItems: "center", gap: L.labelGap },
  columnItem: { gap: 8 },
  grow: { flex: 1 },
  dot: { width: L.mark, height: L.mark, borderRadius: L.markRadius },
  line: { width: L.lineW, height: L.lineH, borderRadius: 2 },
  dashed: { width: L.lineW, flexDirection: "row", justifyContent: "space-between" },
  dash: { width: 5, height: L.lineH, borderRadius: 1 },
});

export default ChartLegend;
