import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { AppText } from "@/components/ui/AppText";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { useScrubTick } from "@/lib/useScrubTick";

type Props = {
  /** The series in focus, drawn solid. Its length sets the x-axis. */
  current: number[];
  /** Drawn dashed and dimmed, and allowed to run PAST the current series — that period is
   *  finished, and where it ended up is what the comparison is for. */
  previous: number[];
  labels?: string[];
  currentLabel: string;
  previousLabel: string;
  activeIndex?: number | null;
  onScrub?: (i: number | null) => void;
  color?: string;
  previousColor?: string;
  height?: number;
};

const TIP_W = 132;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const sampleTicks = (labels: string[]): string[] => {
  const n = labels.length;
  if (n <= 7) return labels;
  const idx = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (n - 1)));
  return Array.from(new Set(idx)).map((i) => labels[i]);
};

/**
 * Two running totals on one axis — this period against the one before, day by day.
 *
 * Both are scaled to the SAME max, which is the whole point: two lines each normalised to
 * their own peak would put a £400 month and a £4,000 month on top of each other.
 *
 * The x-axis spans whichever series is longer, so a 31-day previous month is not cut off at
 * day 28 of the current one; the solid line just stops where the period has got to.
 */
const DualLineChart = ({
  current,
  previous,
  labels,
  currentLabel,
  previousLabel,
  activeIndex,
  onScrub,
  color = "#B0A2FF",
  previousColor = "rgba(255,255,255,0.42)",
  height = 108,
}: Props) => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below
  const [w, setW] = useState(0);
  const active = activeIndex ?? null;
  const padB = 6;
  const chartH = height - padB;

  const span = Math.max(current.length, previous.length);
  const max = Math.max(...current, ...previous, 1);

  const x = (i: number) => (span <= 1 ? w / 2 : (i / (span - 1)) * w);
  const y = (v: number) => chartH - (v / max) * chartH;

  const path = (series: number[]) =>
    series.map((v, i) => `${i ? "L" : "M"} ${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  // Ticks as the scrubber crosses into a new bucket, and only then.
  const scrub = useScrubTick(active, onScrub);

  const pick = (locationX: number) => {
    if (w <= 0 || span === 0) return;
    scrub(clamp(Math.round((locationX / w) * (span - 1)), 0, span - 1));
  };

  const curEnd = current.length - 1;

  return (
    <View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: color }]} />
          <AppText size="xs" color="inkDim">
            {currentLabel}
          </AppText>
        </View>
        <View style={styles.legendItem}>
          {/* Two short strokes rather than a bar: the line it stands for is dashed, and the
              legend has to be readable as the same thing. */}
          <View style={styles.dashSwatch}>
            <View style={[styles.dash, { backgroundColor: previousColor }]} />
            <View style={[styles.dash, { backgroundColor: previousColor }]} />
          </View>
          <AppText size="xs" color="inkDim">
            {previousLabel}
          </AppText>
        </View>
      </View>

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
              <Line
                key={f}
                x1={0}
                y1={chartH * f}
                x2={w}
                y2={chartH * f}
                stroke="rgba(255,255,255,0.07)"
                strokeWidth={1}
              />
            ))}
            {previous.length > 1 && (
              <Path
                d={path(previous)}
                stroke={previousColor}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fill="none"
                strokeLinejoin="round"
              />
            )}
            {/* Shaded under the solid line only: filling both would make the overlap a third
                colour that means nothing. */}
            {current.length > 1 && (
              <Path
                d={`${path(current)} L ${x(curEnd).toFixed(1)},${chartH} L ${x(0).toFixed(1)},${chartH} Z`}
                fill={color}
                fillOpacity={0.12}
              />
            )}
            {current.length > 1 && (
              <Path
                d={path(current)}
                stroke={color}
                strokeWidth={2}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {active !== null && (
              <Line x1={x(active)} y1={0} x2={x(active)} y2={chartH} stroke="rgba(255,255,255,0.28)" strokeWidth={1} />
            )}
            {/* Where the current period has actually got to. Without it the solid line just
                ends, which reads as a gap in the data rather than as today. */}
            {curEnd >= 0 && (
              <Circle cx={x(curEnd)} cy={y(current[curEnd])} r={4.5} fill={color} stroke="#211e33" strokeWidth={2} />
            )}
            {active !== null && active < current.length && (
              <Circle cx={x(active)} cy={y(current[active])} r={5} fill={color} stroke="#211e33" strokeWidth={2} />
            )}
          </Svg>
        )}
        {active !== null && (
          <View style={[styles.tip, { left: clamp(x(active) - TIP_W / 2, 0, Math.max(0, w - TIP_W)) }]}>
            <AppText size="xs" color="inkDim">
              {labels?.[active] ?? ""}
            </AppText>
            <View style={styles.tipRow}>
              <View style={[styles.tipDot, { backgroundColor: color }]} />
              <AppText size="sm" weight="semibold">
                {active < current.length ? formatMoney(current[active]) : "—"}
              </AppText>
            </View>
            <View style={styles.tipRow}>
              <View style={[styles.tipDot, { backgroundColor: previousColor }]} />
              <AppText size="sm" weight="semibold" color="inkDim">
                {active < previous.length ? formatMoney(previous[active]) : "—"}
              </AppText>
            </View>
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
  legend: {
    flexDirection: "row",
    gap: 18,
    marginBottom: 6,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  swatch: {
    width: 14,
    height: 3,
    borderRadius: 2,
  },
  dashSwatch: {
    flexDirection: "row",
    gap: 3,
    width: 14,
  },
  dash: {
    width: 5,
    height: 3,
    borderRadius: 2,
  },
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
    gap: 3,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tipDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
});

export default DualLineChart;
