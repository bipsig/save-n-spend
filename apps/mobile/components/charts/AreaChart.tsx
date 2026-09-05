import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path, Circle, Line } from "react-native-svg";
import { AppText } from "@/components/ui/AppText";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { useScrubTick } from "@/lib/useScrubTick";

type Props = {
  data: number[];
  labels?: string[];     // axis ticks (sampled)
  tipLabels?: string[];  // full labels for the tooltip
  activeIndex?: number | null; // controlled tooltip index (screen owns it)
  onScrub?: (i: number | null) => void;
  color?: string;
  height?: number;
};

const TIP_W = 108;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Thin out axis ticks so they don't crowd — first, last, and a few between.
const sampleTicks = (labels: string[]): string[] => {
  const n = labels.length;
  if (n <= 7) return labels;
  const idx = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (n - 1)));
  return Array.from(new Set(idx)).map((i) => labels[i]);
};

// Single-series area (spec spending trend). Tap or drag across it to inspect the
// exact amount on a given day — a scrubber line, dot, and tooltip. Width is
// measured (onLayout) so coordinates are real px and the endpoint stays round.
const AreaChart = ({ data, labels, tipLabels, activeIndex, onScrub, color = "#8E7DE3", height = 96 }: Props) => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below
  const [w, setW] = useState(0);
  const active = activeIndex ?? null;
  const padB = 6;
  const chartH = height - padB;
  const n = data.length;
  const max = Math.max(...data, 1);

  const x = (i: number) => (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v: number) => chartH - (v / max) * chartH;

  const line = data.map((v, i) => `${i ? "L" : "M"} ${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = n ? `${line} L ${x(n - 1).toFixed(1)},${chartH} L ${x(0).toFixed(1)},${chartH} Z` : "";

  // Ticks as the scrubber crosses into a new day, and only then.
  const scrub = useScrubTick(active, onScrub);

  const pick = (locationX: number) => {
    if (w <= 0 || n === 0) return;
    scrub(clamp(Math.round((locationX / w) * (n - 1)), 0, n - 1));
  };

  return (
    <View>
      <View
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        style={{ height }}
        onStartShouldSetResponder={() => true}
        onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
        onResponderMove={(e) => pick(e.nativeEvent.locationX)}
        onResponderTerminationRequest={() => true}
      >
        {w > 0 && (
          <Svg width={w} height={height}>
            {[0.25, 0.5, 0.75].map((f) => (
              <Line key={f} x1={0} y1={chartH * f} x2={w} y2={chartH * f} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
            ))}
            {n > 1 && <Path d={area} fill={color} fillOpacity={0.12} />}
            {n > 1 && (
              <Path d={line} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            )}
            {active !== null && (
              <Line x1={x(active)} y1={0} x2={x(active)} y2={chartH} stroke="rgba(255,255,255,0.28)" strokeWidth={1} />
            )}
            {n > 0 && (
              <Circle cx={x(n - 1)} cy={y(data[n - 1])} r={4.5} fill={color} stroke="#211e33" strokeWidth={2} />
            )}
            {active !== null && (
              <Circle cx={x(active)} cy={y(data[active])} r={5} fill={color} stroke="#211e33" strokeWidth={2} />
            )}
          </Svg>
        )}
        {active !== null && (
          <View style={[styles.tip, { left: clamp(x(active) - TIP_W / 2, 0, Math.max(0, w - TIP_W)) }]}>
            <AppText size="xs" color="inkDim">
              {(tipLabels ?? labels)?.[active] ?? ""}
            </AppText>
            <AppText size="sm" weight="bold">
              {formatMoney(data[active])}
            </AppText>
          </View>
        )}
      </View>
      {labels && labels.length > 0 && (
        <View style={styles.axis}>
          {sampleTicks(labels).map((t, i) => (
            <AppText key={i} size="xs" color="inkDim">
              {t}
            </AppText>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  axis: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  tip: {
    position: "absolute",
    top: 0,
    width: TIP_W,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#241E42",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
});

export default AreaChart;
