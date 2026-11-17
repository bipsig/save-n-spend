import { StyleSheet, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { chartA11y } from "@/lib/chartSummary";
import { colors } from "@/theme";

const WIDTH = 100;
const HEIGHT = 24;
const PAD = 2;

type Props = {
  /** Oldest first. Fewer than 2 points renders nothing — a flat line from one value
   *  would misrepresent a trend that isn't there yet. */
  values: number[];
  /** Which direction reads as good — "up" for income/savings/net worth, "down" for
   *  expenses, where a rising line is the opposite of welcome and green would say the
   *  wrong thing. Defaults "up". */
  goodDirection?: "up" | "down";
  /** Its VoiceOver sentence. Without one the line is decoration: the figure above it
   *  already says what it shows, so VoiceOver skips it. */
  summary?: string;
};

// No axis, no legend, no scrub — sized to sit under a SummaryCard's own amount, not to
// stand alone. The one thing it exists to show is direction, which the tone (green when
// it moved the good way, dim otherwise) carries without needing a label of its own.
const Sparkline = ({ values, goodDirection = "up", summary }: Props) => {
  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const toY = (v: number) => PAD + (1 - (v - min) / range) * (HEIGHT - PAD * 2);
  const toX = (i: number) => (i / (values.length - 1)) * WIDTH;

  const points = values.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
  const rising = values[values.length - 1] >= values[0];
  const good = goodDirection === "up" ? rising : !rising;

  return (
    <View
      style={styles.wrap}
      {...(summary ? chartA11y(summary) : { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" as const })}
    >
      <Svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <Polyline
          points={points}
          fill="none"
          stroke={good ? colors.success : colors.inkDim}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
  },
});

export default Sparkline;
