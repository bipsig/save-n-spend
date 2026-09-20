import { StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { colors } from "@/theme";

const WIDTH = 320;
const HEIGHT = 56;
const PAD = 6;

type Props = {
  /** One point per day from today through month-end, at the current pace. */
  series: number[];
};

// A single forward-looking line + a zero baseline, sized for an embedded card rather
// than a full-screen chart (no legend, no scrub — see DualLineChart for that shape).
// The one thing this exists to show is whether the line crosses the baseline before it
// ends, so that crossing gets its own marker rather than being left for the eye to find.
const ForecastLine = ({ series }: Props) => {
  if (series.length < 2) return null;

  const max = Math.max(...series, 0);
  const min = Math.min(...series, 0);
  const range = max - min || 1;

  const toY = (value: number) => PAD + (1 - (value - min) / range) * (HEIGHT - PAD * 2);
  const toX = (i: number) => (i / (series.length - 1)) * WIDTH;

  const points = series.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
  const zeroY = toY(0);
  const crossIndex = series.findIndex((v) => v < 0);
  const tone = crossIndex === -1 ? colors.success : colors.warning;

  return (
    <View style={styles.wrap}>
      <Svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
        {min < 0 && (
          <Line x1={0} y1={zeroY} x2={WIDTH} y2={zeroY} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="3 4" />
        )}
        <Polyline points={points} fill="none" stroke={tone} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {crossIndex !== -1 && (
          <Circle cx={toX(crossIndex)} cy={toY(series[crossIndex])} r={4} fill={colors.warning} />
        )}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
  },
});

export default ForecastLine;
