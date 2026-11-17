import { StyleSheet, View } from "react-native";
import { AppText } from "./AppText";
import { tooltipLeft } from "@/lib/fitText";
import { chartTooltip as T } from "@/theme";
import type { ColorToken } from "@/theme";

export type TooltipLine = {
  /** "Value", "Profit", "Spent". Written before the figure, in the same colour. */
  label?: string;
  /** The figure as shown, e.g. `formatMoney(p)` (already masked in privacy mode). */
  value: string;
  tone?: ColorToken;
  /** A series colour dot in front, when the chart has more than one series. */
  dot?: string;
  /** Hollow dot, for a projected series. */
  hollow?: boolean;
};

type Props = {
  /** Centre of the touched point, in the chart's coordinates. */
  x: number;
  /** The chart's measured width. */
  chartWidth: number;
  /** Keeps the tooltip off a y-axis drawn on the right. */
  rightInset?: number;
  top?: number;
  title: string;
  lines: TooltipLine[];
};

// The one chart tooltip: a title line, then labelled figure lines. Presentational only. The
// screen owns which point is open, closes it on an outside tap and on a period or scope change
// (docs/mobile-patterns.md), and the chart reports scrubs through useScrubTick.
const ChartTooltip = ({ x, chartWidth, rightInset = 0, top = 0, title, lines }: Props) => (
  <View pointerEvents="none" style={[styles.tip, { top, left: tooltipLeft(x, chartWidth, T.width, rightInset) }]}>
    <AppText size="xs" weight="bold" color="inkDim" numberOfLines={1}>
      {title}
    </AppText>
    {lines.map((l, i) => (
      <View key={i} style={styles.line}>
        {l.dot && <View style={[styles.dot, l.hollow ? { borderColor: l.dot, borderWidth: 1.5 } : { backgroundColor: l.dot }]} />}
        <AppText
          size="xs"
          weight="black"
          color={l.tone ?? "ink"}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={styles.text}
        >
          {l.label ? `${l.label} ${l.value}` : l.value}
        </AppText>
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  tip: {
    position: "absolute",
    width: T.width,
    gap: 1,
    paddingVertical: T.paddingV,
    paddingHorizontal: T.paddingH,
    borderRadius: T.radius,
    backgroundColor: T.plate,
    borderWidth: 1,
    borderColor: T.border,
  },
  line: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: T.dot, height: T.dot, borderRadius: T.dot / 2 },
  text: { flexShrink: 1 },
});

export default ChartTooltip;
