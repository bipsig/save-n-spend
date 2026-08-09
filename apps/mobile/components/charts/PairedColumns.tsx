import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { G, Line, Rect } from "react-native-svg";
import { AppText } from "@/components/ui/AppText";
import formatMoney from "@/lib/money";
import { incomeColor, expenseColor } from "@/theme/charts";

type Props = {
  data: { income: number; expense: number }[];
  labels: string[];
  activeIndex?: number | null; // controlled tooltip index (screen owns it)
  onScrub?: (i: number | null) => void;
  height?: number;
};

const TIP_W = 128;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Paired columns (spec income vs expense). Tap a unit to read its exact income
// and expense — a highlighted slot + tooltip.
const PairedColumns = ({ data, labels, activeIndex, onScrub, height = 96 }: Props) => {
  const [w, setW] = useState(0);
  const active = activeIndex ?? null;
  const padB = 4;
  const chartH = height - padB;
  const n = data.length || 1;
  const max = Math.max(...data.flatMap((d) => [d.income, d.expense]), 1);

  const slotW = w / n;
  const barW = Math.min(slotW * 0.28, 11);
  const gap = 3;
  const barH = (v: number) => (v / max) * chartH;

  const pick = (locationX: number) => {
    if (w <= 0) return;
    onScrub?.(clamp(Math.floor(locationX / slotW), 0, n - 1));
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
            {active !== null && (
              <Rect x={slotW * active} y={0} width={slotW} height={chartH} rx={6} fill="rgba(255,255,255,0.06)" />
            )}
            {data.map((d, i) => {
              const center = slotW * i + slotW / 2;
              const incH = barH(d.income);
              const expH = barH(d.expense);
              return (
                <G key={i}>
                  <Rect x={center - barW - gap / 2} y={chartH - incH} width={barW} height={incH} rx={2.5} fill={incomeColor} />
                  <Rect x={center + gap / 2} y={chartH - expH} width={barW} height={expH} rx={2.5} fill={expenseColor} />
                </G>
              );
            })}
            <Line x1={0} y1={chartH} x2={w} y2={chartH} stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
          </Svg>
        )}
        {active !== null && (
          <View style={[styles.tip, { left: clamp(slotW * active + slotW / 2 - TIP_W / 2, 0, Math.max(0, w - TIP_W)) }]}>
            <AppText size="xs" color="inkDim" style={styles.tipHead}>
              {labels[active]}
            </AppText>
            <View style={styles.tipRow}>
              <View style={[styles.tipDot, { backgroundColor: incomeColor }]} />
              <AppText size="sm" weight="semibold">
                {formatMoney(data[active].income)}
              </AppText>
            </View>
            <View style={styles.tipRow}>
              <View style={[styles.tipDot, { backgroundColor: expenseColor }]} />
              <AppText size="sm" weight="semibold">
                {formatMoney(data[active].expense)}
              </AppText>
            </View>
          </View>
        )}
      </View>
      <View style={styles.labels}>
        {labels.map((l, i) => (
          <AppText key={i} size="xs" color="inkDim" style={styles.label} numberOfLines={1}>
            {l}
          </AppText>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  labels: {
    flexDirection: "row",
    marginTop: 6,
  },
  label: {
    flex: 1,
    textAlign: "center",
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
  tipHead: {
    letterSpacing: 0.5,
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

export default PairedColumns;
