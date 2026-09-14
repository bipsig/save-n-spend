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
  /** Where `current` is headed by period-end if its pace holds — drawn as a third segment,
   *  dashed in `color` rather than `previousColor`, continuing on from the current line's
   *  last point to the period's final bucket. Omit entirely for a finished period; there is
   *  nothing left to project. */
  projectedEnd?: number;
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
  projectedEnd,
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
  // The projection is usually the largest figure on the chart — a future total, not a
  // running one — so it has to be in the scale or its own line would clip off the top.
  const max = Math.max(...current, ...previous, projectedEnd ?? 0, 1);

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

  // The straight-line value AT a scrubbed index along the projected segment — not just its
  // endpoint, so scrubbing partway between today and period-end reads as "on pace for ₹X by
  // THIS point" rather than only ever showing the final total.
  const projectedAt = (i: number): number => {
    if (projectedEnd === undefined || curEnd < 0) return projectedEnd ?? 0;
    if (span - 1 === curEnd) return current[curEnd];
    const t = (i - curEnd) / (span - 1 - curEnd);
    return current[curEnd] + (projectedEnd - current[curEnd]) * t;
  };
  // Only once the scrubber is actually on the dashed segment — before that, "current" already
  // has the real answer and a projected row would just repeat it.
  const showProjected = projectedEnd !== undefined && curEnd >= 0 && curEnd < span - 1;

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
        {projectedEnd !== undefined && (
          <View style={styles.legendItem}>
            {/* Same two-stroke shape as the previous swatch, in `color` instead of
                `previousColor` — dashed like "previous", but distinguishable by hue since
                both are on screen at once. */}
            <View style={styles.dashSwatch}>
              <View style={[styles.dash, { backgroundColor: color }]} />
              <View style={[styles.dash, { backgroundColor: color }]} />
            </View>
            <AppText size="xs" color="inkDim">
              Projected
            </AppText>
          </View>
        )}
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
            {/* From where the current line actually stops to the period's final bucket —
                the same x-position `previous` already reaches when it's the longer series.
                Dashed and in `color` rather than a fill, so it reads as a forecast continuing
                the solid line rather than a second real series. */}
            {projectedEnd !== undefined && curEnd >= 0 && curEnd < span - 1 && (
              <Path
                d={`M ${x(curEnd).toFixed(1)},${y(current[curEnd]).toFixed(1)} L ${x(span - 1).toFixed(1)},${y(projectedEnd).toFixed(1)}`}
                stroke={color}
                strokeWidth={2}
                strokeDasharray="5 5"
                strokeLinecap="round"
                fill="none"
              />
            )}
            {active !== null && (
              <Line x1={x(active)} y1={0} x2={x(active)} y2={chartH} stroke="rgba(255,255,255,0.28)" strokeWidth={1} />
            )}
            {/* Where the projected line actually lands, so the number the KPI tile states is
                also a point you can see on the chart. */}
            {projectedEnd !== undefined && curEnd >= 0 && curEnd < span - 1 && (
              <Circle cx={x(span - 1)} cy={y(projectedEnd)} r={4} fill="none" stroke={color} strokeWidth={2} />
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
            {/* Labelled now that there can be three rows — with only two, the colour and the
                legend above were enough; a third made it possible to mistake "last month"
                for "projected" at a glance (they're both dashed lines). */}
            <View style={styles.tipRow}>
              <View style={[styles.tipDot, { backgroundColor: color }]} />
              <AppText size="xs" color="inkDim">This</AppText>
              <AppText size="sm" weight="semibold" style={styles.tipValue}>
                {active < current.length ? formatMoney(current[active]) : "—"}
              </AppText>
            </View>
            <View style={styles.tipRow}>
              <View style={[styles.tipDot, { backgroundColor: previousColor }]} />
              <AppText size="xs" color="inkDim">Last</AppText>
              <AppText size="sm" weight="semibold" color="inkDim" style={styles.tipValue}>
                {active < previous.length ? formatMoney(previous[active]) : "—"}
              </AppText>
            </View>
            {showProjected && (
              <View style={styles.tipRow}>
                {/* Hollow rather than filled — the same distinction the chart itself draws
                    between the real end-point dot and the projected one. */}
                <View style={[styles.tipDot, styles.tipDotHollow, { borderColor: color }]} />
                <AppText size="xs" color="inkDim">Proj</AppText>
                <AppText size="sm" weight="semibold" style={styles.tipValue}>
                  {formatMoney(Math.round(projectedAt(active)))}
                </AppText>
              </View>
            )}
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
  tipDotHollow: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
  },
  tipValue: {
    flex: 1,
    textAlign: "right",
  },
});

export default DualLineChart;
