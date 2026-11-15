import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { PortfolioTrend } from "@save-n-spend/types";
import Card from "@/components/data/Card";
import { ProfitChart, ValueHistoryChart, lastN } from "@/components/charts/InvestmentCharts";
import { AppText } from "@/components/ui/AppText";
import PressableScale from "@/components/ui/PressableScale";
import { compactMoney } from "@/lib/investments";
import { usePrivacyMask } from "@/lib/money";
import { colors, radius, spacing } from "@/theme";
import { signTone } from "@/lib/signTone";

export const ALL_SCOPE = "all";
type Range = 6 | 12 | 0;

const Pill = ({ label, on, onPress, big, disabled }: { label: string; on: boolean; onPress: () => void; big?: boolean; disabled?: boolean }) => (
  <PressableScale onPress={onPress} disabled={disabled} scaleTo={0.94} accessibilityRole="button" accessibilityState={{ selected: on, disabled }}>
    <View style={[styles.pill, big && styles.pillBig, on && styles.pillOn, disabled && !on && styles.pillOff]}>
      <AppText size="xs" weight="bold" color={on ? "ink" : "inkDim"} numberOfLines={1}>{label}</AppText>
    </View>
  </PressableScale>
);

const Stat = ({ label, text, color }: { label: string; text: string; color: "success" | "danger" | "ink" | "inkDim" }) => (
  <Card style={styles.stat}>
    <AppText size="xs" color="inkDim" numberOfLines={1}>{label}</AppText>
    <AppText size="sm" weight="black" color={color} numberOfLines={1}>{text}</AppText>
  </Card>
);

type Props = {
  trend: PortfolioTrend;
  /** `ALL_SCOPE` or a holding id. The strip always starts with All, so it is one tap away. */
  initialScope?: string;
  /** On a holding's own page: the pills stay visible but only that holding is live, so the
   *  screen's title and the figures under it can never disagree. */
  locked?: boolean;
};

/**
 * One screen for the whole portfolio and for any single holding: a strip of scope pills
 * re-scopes the charts in place, so there is no "how do I get back to all" — it is the first pill.
 */
const TrendsView = ({ trend, initialScope = ALL_SCOPE, locked = false }: Props) => {
  const masked = usePrivacyMask();
  const [scope, setScope] = useState(initialScope);
  const [range, setRange] = useState<Range>(12);
  // The one open tooltip. A tap anywhere that is not a chart closes it, as on Insights.
  const [tip, setTip] = useState<{ chart: "value" | "profit"; i: number } | null>(null);

  const holding = trend.holdings.find((h) => h.id === scope) ?? null;
  const series = holding ?? trend;
  const cut = <T,>(xs: T[]) => (range === 0 ? xs : lastN(xs, range));
  const points = useMemo(() => cut(series.points), [series, range]);
  const growth = useMemo(() => cut(series.growth), [series, range]);

  const updated = growth.filter((g) => g.upd && g.growth !== null);
  const best = updated.reduce<number | null>((a, g) => (a === null || (g.growth as number) > a ? (g.growth as number) : a), null);
  const worst = updated.reduce<number | null>((a, g) => (a === null || (g.growth as number) < a ? (g.growth as number) : a), null);
  const lastPoint = series.points[series.points.length - 1];
  const profit = lastPoint.value - lastPoint.invested;

  const lastUpdate = holding?.lastUpdatedAt
    ? new Date(holding.lastUpdatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    : null;
  const money = (n: number | null, signed = true) => (n === null ? "—" : masked ? "••" : compactMoney(n, signed));
  const tone = (n: number | null) => (n === null ? "inkDim" : signTone(n));

  return (
    <Pressable style={styles.wrap} onPress={() => setTip(null)}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        <Pill label="All" big disabled={locked} on={scope === ALL_SCOPE} onPress={() => { setTip(null); setScope(ALL_SCOPE); }} />
        {trend.holdings.map((h) => (
          <Pill key={h.id} label={h.name} big disabled={locked && h.id !== initialScope} on={scope === h.id} onPress={() => { setTip(null); setScope(h.id); }} />
        ))}
      </ScrollView>

      <View style={styles.controls}>
        <View style={styles.pills}>
          <Pill label="6M" on={range === 6} onPress={() => { setTip(null); setRange(6); }} />
          <Pill label="1Y" on={range === 12} onPress={() => { setTip(null); setRange(12); }} />
          <Pill label="All time" on={range === 0} onPress={() => { setTip(null); setRange(0); }} />
        </View>
      </View>

      <View style={styles.stats}>
        <Stat label="Profit so far" text={money(profit)} color={tone(profit)} />
        <Stat label="Best month" text={money(best)} color={tone(best)} />
        <Stat label="Worst month" text={money(worst)} color={tone(worst)} />
      </View>

      {lastUpdate && <AppText size="xs" color="inkDim" style={styles.fresh}>Value last updated {lastUpdate}</AppText>}

      {points.length < 3 && (
        <AppText size="xs" color="inkDim" style={styles.fresh}>
          Your history starts {points[0]?.label} — it fills in as the months go by.
        </AppText>
      )}

      <Card style={styles.card}>
        <AppText size="xs" weight="semibold" color="inkDim" style={styles.caps}>VALUE</AppText>
        <ValueHistoryChart key={`v-${scope}-${range}`} points={points} activeIndex={tip?.chart === "value" ? tip.i : null} onScrub={(i) => setTip(i === null ? null : { chart: "value", i })} />
      </Card>

      <Card style={styles.card}>
        <AppText size="xs" weight="semibold" color="inkDim" style={styles.caps}>PROFIT / LOSS</AppText>
        <ProfitChart key={`p-${scope}-${range}`} points={points} growth={growth} activeIndex={tip?.chart === "profit" ? tip.i : null} onScrub={(i) => setTip(i === null ? null : { chart: "profit", i })} />
        <AppText size="xs" color="inkDim">Profit or loss from value updates — money you add isn't counted as growth.</AppText>
      </Card>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  strip: { gap: 6, paddingRight: spacing.lg },
  controls: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pills: { flexDirection: "row", gap: 6 },
  pill: {
    height: 26, paddingHorizontal: 11, borderRadius: radius.full, justifyContent: "center",
    backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder,
  },
  pillBig: { height: 32, paddingHorizontal: 14 },
  pillOff: { opacity: 0.35 },
  pillOn: { backgroundColor: colors.accentSoft, borderColor: colors.primary },
  stats: { flexDirection: "row", gap: spacing.sm },
  stat: { flex: 1, gap: 2, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  fresh: { paddingHorizontal: 2 },
  card: { gap: spacing.sm },
  caps: { letterSpacing: 1, textTransform: "uppercase" },
});

export default TrendsView;
