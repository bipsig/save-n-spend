import { StyleSheet, View } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";
import { AppText } from "@/components/ui/AppText";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { useScrubTick } from "@/lib/useScrubTick";

export type DonutSlice = { id: string; name: string; total: number; pct: number; color: string };

type Props = {
  data: DonutSlice[];
  /** Shown in the hole when nothing is selected — the whole. */
  centerLabel: string;
  centerValue: number;
  activeIndex?: number | null;
  onScrub?: (i: number | null) => void;
  size?: number;
  thickness?: number;
};

const GAP_DEG = 1.6;

const polar = (cx: number, cy: number, r: number, deg: number) => {
  // -90 so the first slice starts at 12 o'clock, which is where a reader's eye starts.
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

/** An annular wedge. Two arcs and two straight edges — no `strokeDasharray` tricks, so the
 *  gap between slices is real geometry and stays put at any thickness. */
const wedge = (cx: number, cy: number, rOuter: number, rInner: number, from: number, to: number) => {
  const large = to - from > 180 ? 1 : 0;
  const o1 = polar(cx, cy, rOuter, from);
  const o2 = polar(cx, cy, rOuter, to);
  const i2 = polar(cx, cy, rInner, to);
  const i1 = polar(cx, cy, rInner, from);

  return [
    `M ${o1.x.toFixed(2)},${o1.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${o2.x.toFixed(2)},${o2.y.toFixed(2)}`,
    `L ${i2.x.toFixed(2)},${i2.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${i1.x.toFixed(2)},${i1.y.toFixed(2)}`,
    "Z",
  ].join(" ");
};

/**
 * The window's spending as a ring, biggest slice first from 12 o'clock.
 *
 * A donut rather than a pie: the hole is where the total goes, so the chart answers "how much,
 * and of what" in one glance instead of needing a figure printed beside it. Tapping a slice
 * swaps the centre for that slice's own name and amount.
 *
 * Hit-tested by ANGLE, not by the SVG path: `react-native-svg` press events on overlapping
 * transparent geometry are unreliable across platforms, and one angle calculation is both
 * exact and the same on each.
 */
const DonutChart = ({
  data,
  centerLabel,
  centerValue,
  activeIndex,
  onScrub,
  size = 176,
  thickness = 26,
}: Props) => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below
  const active = activeIndex ?? null;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 2;
  const rInner = rOuter - thickness;

  const sum = data.reduce((a, s) => a + s.total, 0);

  // Cumulative sweeps, so rounding never leaves a hairline between two slices.
  let cursor = 0;
  const arcs = data.map((slice) => {
    const from = cursor;
    cursor += sum > 0 ? (slice.total / sum) * 360 : 0;
    return { slice, from, to: cursor };
  });

  const scrub = useScrubTick(active, onScrub);

  const pick = (locationX: number, locationY: number) => {
    const dx = locationX - cx;
    const dy = locationY - cy;
    const distance = Math.hypot(dx, dy);

    // The hole and the margin outside the ring are not slices. Tapping there clears, which
    // is how the centre gets back to showing the total.
    if (distance < rInner || distance > rOuter + 6) {
      scrub(null);
      return;
    }

    const deg = (((Math.atan2(dy, dx) * 180) / Math.PI + 90) + 360) % 360;
    const hit = arcs.findIndex((a) => deg >= a.from && deg < a.to);
    scrub(hit === -1 ? null : hit);
  };

  const shown = active !== null ? data[active] : null;

  return (
    <View style={styles.wrap}>
      <View
        style={{ width: size, height: size }}
        onStartShouldSetResponder={() => true}
        onResponderGrant={(e) => pick(e.nativeEvent.locationX, e.nativeEvent.locationY)}
        onResponderMove={(e) => pick(e.nativeEvent.locationX, e.nativeEvent.locationY)}
        onResponderTerminationRequest={() => true}
      >
        <Svg width={size} height={size}>
          {/* A ring behind the slices, so a window with no spending still reads as a chart
              waiting for data rather than as a failure to draw. */}
          <Circle cx={cx} cy={cy} r={(rOuter + rInner) / 2} stroke="rgba(255,255,255,0.06)" strokeWidth={thickness} fill="none" />
          <G>
            {arcs.map(({ slice, from, to }, i) => {
              if (to - from <= 0) return null;
              // The gap is taken off the end, and never past the slice's own width — a
              // sliver would otherwise invert and draw the long way round the ring.
              const end = Math.max(from + 0.4, to - Math.min(GAP_DEG, (to - from) / 2));
              const lifted = active === i;
              return (
                <Path
                  key={slice.id}
                  d={wedge(cx, cy, lifted ? rOuter : rOuter - 2, lifted ? rInner - 2 : rInner, from, end)}
                  fill={slice.color}
                  fillOpacity={active === null || lifted ? 1 : 0.38}
                />
              );
            })}
          </G>
        </Svg>

        {/* Centred over the whole square and inset by the ring, so a long category name wraps
            inside the hole instead of running out over the slices. */}
        <View style={[StyleSheet.absoluteFill, styles.hole, { paddingHorizontal: thickness + 8 }]}>
          <AppText size="xs" color="inkDim" numberOfLines={1} style={styles.holeLabel}>
            {shown ? shown.name : centerLabel}
          </AppText>
          <AppText size="md" weight="black" numberOfLines={1} style={styles.holeValue}>
            {formatMoney(shown ? shown.total : centerValue)}
          </AppText>
          {shown && (
            <AppText size="xs" color="inkDim">
              {`${Math.round(shown.pct)}%`}
            </AppText>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
  },
  hole: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  holeLabel: {
    textAlign: "center",
  },
  holeValue: {
    textAlign: "center",
  },
});

export default DonutChart;
