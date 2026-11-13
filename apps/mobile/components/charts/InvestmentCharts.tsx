import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import type { GrowthPoint, MonthPoint } from "@save-n-spend/types";
import { AppText } from "@/components/ui/AppText";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { compactMoney } from "@/lib/investments";
import { useScrubTick } from "@/lib/useScrubTick";
import { colors, spacing } from "@/theme";

const VIOLET = "#B0A2FF";
const AXIS_W = 46;
const PAD_L = 8;

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatMoney(Math.abs(n))}`;
const tone = (n: number) => (n > 0 ? "success" : n < 0 ? "danger" : "inkDim");

/** The last `n` entries — the chart range. */
export const lastN = <T,>(xs: T[], n: number): T[] => (xs.length > n ? xs.slice(xs.length - n) : xs);

const Axis = ({ w, y, ticks, masked }: { w: number; y: (v: number) => number; ticks: number[]; masked: boolean }) => (
  <>
    {ticks.map((v) => (
      <View key={v} pointerEvents="none" style={{ position: "absolute", left: w - AXIS_W + 4, top: y(v) - 7, width: AXIS_W - 4 }}>
        <AppText size="xs" color="inkDim" numberOfLines={1}>{masked ? "••" : compactMoney(v)}</AppText>
      </View>
    ))}
  </>
);

const ticksOf = (lo: number, hi: number, n: number) => Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);

/** Tag riding the right edge at the latest value — how a price chart shows "now". */
const LastTag = ({ w, y, text, color }: { w: number; y: number; text: string; color: string }) => (
  <View pointerEvents="none" style={[styles.tag, { left: w - AXIS_W + 2, top: y - 9, backgroundColor: color }]}>
    <AppText size="xs" weight="black" style={{ color: colors.bg }} numberOfLines={1}>{text}</AppText>
  </View>
);

/** Touch layer: a tap picks the nearest month, and dragging scrubs across them with a tick per step. */
const Scrub = ({ count, slot, active, onPick }: { count: number; slot: number; active: number | null; onPick: (i: number | null) => void }) => {
  const tick = useScrubTick(active, onPick);
  const pick = (locationX: number) => {
    if (slot <= 0) return;
    tick(Math.max(0, Math.min(count - 1, Math.round((locationX - PAD_L) / slot - 0.5))));
  };
  return (
    <View
      style={StyleSheet.absoluteFill}
      onStartShouldSetResponder={() => true}
      onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
      onResponderMove={(e) => pick(e.nativeEvent.locationX)}
      onResponderTerminationRequest={() => true}
    />
  );
};

const TIP_W = 124;

/** Bubble beside the touched month, kept inside the plot. */
const Tip = ({ w, x, y, title, lines }: { w: number; x: number; y: number; title: string; lines: { text: string; color?: "success" | "danger" | "warning" | "inkDim" }[] }) => (
  <View
    pointerEvents="none"
    style={[styles.tip, { width: TIP_W, left: Math.max(0, Math.min(x - TIP_W / 2, w - AXIS_W - TIP_W)), top: Math.max(0, y - 20 - 14 * lines.length - 18) }]}
  >
    <AppText size="xs" weight="bold" color="inkDim">{title}</AppText>
    {lines.map((l, k) => (
      <AppText key={k} size="xs" weight="black" color={l.color} numberOfLines={1}>{l.text}</AppText>
    ))}
  </View>
);

const MonthAxis = ({ labels }: { labels: string[] }) => (
  <View style={[styles.months, { marginRight: AXIS_W }]}>
    {labels.map((l, i) => (
      <AppText key={`${l}-${i}`} size="xs" color="inkDim" style={styles.tick}>{l}</AppText>
    ))}
  </View>
);

/**
 * Value at each month end (violet) over the money put in (teal step). A month with no value
 * update simply carries the last gain forward, so it looks like any other month: nothing
 * changed except money added.
 */
type Scrubbed = {
  /** The month being touched, or null when no tooltip is open. Owned by the screen so a tap elsewhere can close it. */
  activeIndex: number | null;
  onScrub: (i: number | null) => void;
};

export const ValueHistoryChart = ({ points, height = 150, activeIndex, onScrub }: { points: MonthPoint[]; height?: number } & Scrubbed) => {
  const masked = usePrivacyMask();
  const [w, setW] = useState(0);
  const open = activeIndex !== null && activeIndex < points.length;
  const i = open ? (activeIndex as number) : points.length - 1;
  const sel = points[i];

  const all = points.flatMap((p) => [p.value, p.invested]);
  const hi = Math.max(...all, 1);
  const lo = Math.max(0, Math.min(...all) * 0.94);
  const span = hi - lo || 1;
  const padT = 10, padB = 4;
  const plotW = w - AXIS_W - PAD_L;
  const slot = plotW / points.length;
  const x = (k: number) => PAD_L + slot * (k + 0.5);
  const y = (v: number) => padT + (1 - (v - lo) / span) * (height - padT - padB);

  const step = points.map((p, k) => (k === 0 ? `M ${x(0)},${y(p.invested)}` : `H ${x(k)} V ${y(p.invested)}`)).join(" ");
  const line = points.map((p, k) => `${k ? "L" : "M"} ${x(k)},${y(p.value)}`).join(" ");
  const last = points[points.length - 1];
  const gain = sel.value - sel.invested;

  return (
    <View style={styles.block}>
      <View style={styles.readout}>
        <AppText size="xs" weight="bold" color="inkDim">{sel.label}{sel.partial ? " · so far" : ""}</AppText>
        <AppText size="sm" weight="black">{formatMoney(sel.value)}</AppText>
        <AppText size="xs" weight="bold" color={tone(gain)}>{signed(gain)} on {formatMoney(sel.invested)} invested</AppText>
      </View>
      <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 && (
          <>
            <Svg width={w} height={height}>
              <Defs>
                <LinearGradient id="vfill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={VIOLET} stopOpacity={0.3} />
                  <Stop offset="1" stopColor={VIOLET} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              {ticksOf(lo, hi, 3).map((v) => (
                <Line key={v} x1={0} x2={w - AXIS_W} y1={y(v)} y2={y(v)} stroke={colors.line} strokeWidth={1} />
              ))}
              <Path d={`${line} L ${x(points.length - 1)},${height} L ${x(0)},${height} Z`} fill="url(#vfill)" />
              <Path d={step} stroke={colors.teal} strokeWidth={1.4} fill="none" />
              {points.slice(1).map((p, k) => (
                <Path
                  key={p.month}
                  d={`M ${x(k)},${y(points[k].value)} L ${x(k + 1)},${y(p.value)}`}
                  stroke={VIOLET}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                />
              ))}
              {open && <Line x1={x(i)} x2={x(i)} y1={0} y2={height} stroke={colors.ink} strokeOpacity={0.25} strokeDasharray="2 3" />}
              {points.map((p, k) => (
                <Circle key={p.month} cx={x(k)} cy={y(p.value)} r={open && k === i ? 5 : 3} fill={VIOLET} stroke={VIOLET} strokeWidth={2} />
              ))}
            </Svg>
            <Axis w={w} y={y} ticks={ticksOf(lo, hi, 3)} masked={masked} />
            <LastTag w={w} y={y(last.value)} text={masked ? "••" : compactMoney(last.value)} color={VIOLET} />
            {open && <Tip
              w={w}
              x={x(i)}
              y={y(sel.value)}
              title={`${sel.label}${sel.partial ? " · so far" : ""}`}
              lines={[
                { text: masked ? "••" : compactMoney(sel.value) },
                { text: masked ? "••" : `${compactMoney(gain, true)} gain`, color: gain > 0 ? "success" : gain < 0 ? "danger" : "inkDim" },
              ]}
            />}
            <Scrub count={points.length} slot={slot} active={activeIndex} onPick={onScrub} />
          </>
        )}
      </View>
      <MonthAxis labels={points.map((p) => p.label)} />
      <View style={styles.legend}>
        <Legend color={VIOLET} text="Value" />
        <Legend color={colors.teal} text="Invested" />
      </View>
    </View>
  );
};

const Legend = ({ color, text }: { color: string; text: string }) => (
  <View style={styles.legendItem}>
    <View style={[styles.swatch, { backgroundColor: color }]} />
    <AppText size="xs" color="inkDim">{text}</AppText>
  </View>
);

type ProfitProps = {
  points: MonthPoint[];
  /** One per point, same months. */
  growth: GrowthPoint[];
};

/**
 * Two panes in the manner of a price chart over an indicator. Top: total profit so far (value
 * minus money put in), green above zero and red below. Bottom: what each month added or took
 * away. A month nobody updated has no bar: nothing changed. The first month is where the
 * history starts, so it gets a diamond.
 */
export const ProfitChart = ({ points, growth, activeIndex, onScrub }: ProfitProps & Scrubbed) => {
  const masked = usePrivacyMask();
  const [w, setW] = useState(0);
  const n = points.length;
  const open = activeIndex !== null && activeIndex < n;
  const i = open ? (activeIndex as number) : n - 1;

  const profit = points.map((p) => p.value - p.invested);
  const topH = 120, gap = 18, botH = 76;
  const height = topH + gap + botH;
  const plotW = w - AXIS_W - PAD_L;
  const slot = plotW / n;
  const x = (k: number) => PAD_L + slot * (k + 0.5);

  const pHi = Math.max(...profit, 0), pLo = Math.min(...profit, 0);
  const pad = (pHi - pLo || 1) * 0.12;
  const hi = pHi + pad, lo = pLo - pad;
  const y = (v: number) => 6 + (1 - (v - lo) / (hi - lo)) * (topH - 12);
  const z = y(0);

  const val = (g: GrowthPoint) => g.growth;
  const biggest = Math.max(...growth.map((g) => Math.abs(val(g) ?? 0)), 1);
  const bz = topH + gap + botH / 2;
  const half = botH / 2 - 4;

  const profitPath = profit.map((v, k) => `${k ? "L" : "M"} ${x(k)},${y(v)}`).join(" ");
  const colorOf = (v: number) => (v >= 0 ? colors.success : colors.danger);
  const lastProfit = profit[n - 1];

  const g = growth[i];
  const changeText = g.opening
    ? "History starts here"
    : !g.upd
      ? "No change"
      : `${signed(g.growth as number)}${g.pct !== null ? ` · ${g.pct >= 0 ? "+" : "−"}${Math.abs(g.pct).toFixed(1)}%` : ""}`;

  return (
    <View style={styles.block}>
      <View style={styles.readout}>
        <AppText size="xs" weight="bold" color="inkDim">{points[i].label}{points[i].partial ? " · so far" : ""}</AppText>
        <AppText size="sm" weight="black" color={tone(profit[i])}>{signed(profit[i])} profit so far</AppText>
        <AppText size="xs" weight="bold" color={g.opening || !g.upd ? "inkDim" : tone(g.growth as number)}>{changeText}</AppText>
        {g.upd && !g.opening && g.cover > 1 && <AppText size="xs" color="inkDim">Covers the {g.cover} months since the last update</AppText>}
      </View>
      <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 && (
          <>
            <Svg width={w} height={height}>
              <Defs>
                <LinearGradient id="pfill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={colors.success} stopOpacity={0.3} />
                  <Stop offset="1" stopColor={colors.success} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              {ticksOf(lo, hi, 3).map((v) => (
                <Line key={v} x1={0} x2={w - AXIS_W} y1={y(v)} y2={y(v)} stroke={colors.line} strokeWidth={1} />
              ))}
              <Line x1={0} x2={w - AXIS_W} y1={z} y2={z} stroke={colors.inkDim} strokeOpacity={0.5} />
              {lastProfit >= 0 && n > 1 && <Path d={`${profitPath} L ${x(n - 1)},${z} L ${x(0)},${z} Z`} fill="url(#pfill)" />}
              {profit.slice(1).map((v, k) => (
                <Path
                  key={points[k + 1].month}
                  d={`M ${x(k)},${y(profit[k])} L ${x(k + 1)},${y(v)}`}
                  stroke={colorOf(v)}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                />
              ))}
              {profit.map((v, k) => (
                <Circle key={points[k].month} cx={x(k)} cy={y(v)} r={open && k === i ? 5 : 3} fill={colorOf(v)} stroke={colorOf(v)} strokeWidth={2} />
              ))}

              <Line x1={0} x2={w - AXIS_W} y1={bz} y2={bz} stroke={colors.inkDim} strokeOpacity={0.4} />
              {open && <Line x1={x(i)} x2={x(i)} y1={0} y2={height} stroke={colors.ink} strokeOpacity={0.25} strokeDasharray="2 3" />}
              {growth.map((gp, k) => {
                const v = val(gp);
                if (gp.opening || v === null) {
                  return <Rect key={gp.month} x={x(k) - 3.5} y={bz - 3.5} width={7} height={7} fill={colors.inkDim} rotation={45} origin={`${x(k)}, ${bz}`} />;
                }
                if (!gp.upd) return null;
                const h = Math.max(2, (Math.abs(v) / biggest) * half);
                return (
                  <Rect
                    key={gp.month}
                    x={x(k) - Math.min(7, slot * 0.3)}
                    y={v >= 0 ? bz - h : bz}
                    width={Math.min(14, slot * 0.6)}
                    height={h}
                    rx={2}
                    fill={colorOf(v)}
                    fillOpacity={!open || k === i ? 1 : 0.6}
                  />
                );
              })}
            </Svg>
            <Axis w={w} y={y} ticks={ticksOf(lo, hi, 3)} masked={masked} />
            <LastTag w={w} y={y(lastProfit)} text={masked ? "••" : compactMoney(lastProfit, true)} color={colorOf(lastProfit)} />
            <View pointerEvents="none" style={{ position: "absolute", left: 0, top: topH + 2 }}>
              <AppText size="xs" color="inkDim" style={styles.caps}>Monthly change</AppText>
            </View>
            {open && <Tip
              w={w}
              x={x(i)}
              y={y(profit[i])}
              title={`${points[i].label}${points[i].partial ? " · so far" : ""}`}
              lines={[
                { text: masked ? "••" : `${compactMoney(profit[i], true)} profit`, color: profit[i] > 0 ? "success" : profit[i] < 0 ? "danger" : "inkDim" },
                g.opening
                  ? { text: "history starts", color: "inkDim" as const }
                  : !g.upd
                    ? { text: "no change", color: "inkDim" as const }
                    : { text: masked ? "••" : `${compactMoney(g.growth as number, true)}${g.pct !== null ? ` · ${g.pct >= 0 ? "+" : "−"}${Math.abs(g.pct).toFixed(1)}%` : ""} month`, color: (g.growth as number) > 0 ? "success" as const : (g.growth as number) < 0 ? "danger" as const : "inkDim" as const },
              ]}
            />}
            <Scrub count={n} slot={slot} active={activeIndex} onPick={onScrub} />
          </>
        )}
      </View>
      <MonthAxis labels={points.map((p) => p.label)} />
    </View>
  );
};

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  readout: { gap: 2, minHeight: 58 },
  months: { flexDirection: "row", marginLeft: PAD_L },
  tick: { flex: 1, textAlign: "center" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  caps: { letterSpacing: 1, textTransform: "uppercase", fontSize: 10 },
  tip: { position: "absolute", gap: 1, paddingVertical: 6, paddingHorizontal: 9, borderRadius: 10, backgroundColor: "rgba(32,28,60,0.96)", borderWidth: 1, borderColor: colors.glassBorder },
  tag: { position: "absolute", minWidth: AXIS_W, height: 18, borderRadius: 4, paddingHorizontal: 4, justifyContent: "center" },
});
