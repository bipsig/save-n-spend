import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet } from "react-native";
import type { PortfolioTrend } from "@save-n-spend/types";
import Card from "@/components/data/Card";
import { ProfitChart, ValueHistoryChart, lastN } from "@/components/charts/InvestmentCharts";
import { AppText } from "@/components/ui/AppText";
import Caps from "@/components/ui/Caps";
import Chip from "@/components/ui/Chip";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { StatRow, type StatTileProps } from "@/components/ui/StatTile";
import { formatMoneyExact } from "@/lib/money";
import { formatInstant } from "@/lib/format/date";
import { spacing } from "@/theme";
import { signTone } from "@/lib/signTone";

export const ALL_SCOPE = "all";
export type InvestTab = "overview" | "trends";

/** The Overview | Trends switch on the hub and on a holding's page. */
export const INVEST_TABS: { key: InvestTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "trends", label: "Trends" },
];

type Range = "6" | "12" | "0";
const RANGES: { key: Range; label: string; accessibilityLabel?: string }[] = [
  { key: "6", label: "6M", accessibilityLabel: "6 months" },
  { key: "12", label: "1Y", accessibilityLabel: "1 year" },
  { key: "0", label: "All time" },
];

const signedExact = (p: number) => formatMoneyExact(p, { sign: "always" });

type Props = {
  trend: PortfolioTrend;
  /** `ALL_SCOPE` or a holding id. The strip always starts with All, so it is one tap away. */
  initialScope?: string;
  /** On a holding's own page: the chips stay visible but only that holding is live, so the
   *  screen's title and the figures under it can never disagree. */
  locked?: boolean;
};

/**
 * One screen for the whole portfolio and for any single holding: a strip of scope chips
 * re-scopes the charts in place, so there is no "how do I get back to all" — it is the first chip.
 */
const TrendsView = ({ trend, initialScope = ALL_SCOPE, locked = false }: Props) => {
  const [scope, setScope] = useState(initialScope);
  const [range, setRange] = useState<Range>("12");
  // The one open tooltip. A tap anywhere that is not a chart closes it, as on Insights.
  const [tip, setTip] = useState<{ chart: "value" | "profit"; i: number } | null>(null);

  const holding = trend.holdings.find((h) => h.id === scope) ?? null;
  const series = holding ?? trend;
  const months = Number(range);
  const cut = <T,>(xs: T[]) => (months === 0 ? xs : lastN(xs, months));
  const points = useMemo(() => cut(series.points), [series, range]);
  const growth = useMemo(() => cut(series.growth), [series, range]);

  const updated = growth.filter((g) => g.upd && g.growth !== null);
  const best = updated.reduce<number | null>((a, g) => (a === null || (g.growth as number) > a ? (g.growth as number) : a), null);
  const worst = updated.reduce<number | null>((a, g) => (a === null || (g.growth as number) < a ? (g.growth as number) : a), null);
  const lastPoint = series.points[series.points.length - 1];
  const profit = lastPoint.value - lastPoint.invested;

  const lastUpdate = holding?.lastUpdatedAt ? formatInstant(holding.lastUpdatedAt, "day") : null;
  // Exact to the paisa (Q4): the row shrinks the figures and then reflows rather than round them.
  const stat = (label: string, n: number | null): StatTileProps =>
    n === null
      ? { label, text: "—", tone: "inkDim" }
      : { label, amount: n, signed: true, format: signedExact, tone: signTone(n) };

  return (
    // `accessible={false}`: a Pressable is one VoiceOver element by default, which would read
    // the whole tab as a single button and hide the chips and charts inside it.
    <Pressable style={styles.wrap} onPress={() => setTip(null)} accessible={false}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        <Chip label="All" singleLine disabled={locked} selected={scope === ALL_SCOPE} onPress={() => { setTip(null); setScope(ALL_SCOPE); }} />
        {trend.holdings.map((h) => (
          <Chip key={h.id} label={h.name} singleLine disabled={locked && h.id !== initialScope} selected={scope === h.id} onPress={() => { setTip(null); setScope(h.id); }} />
        ))}
      </ScrollView>

      <SegmentedControl
        size="sm"
        accessibilityLabel="Range"
        segments={RANGES}
        value={range}
        onChange={(r) => { setTip(null); setRange(r); }}
      />

      <StatRow size="sm" items={[stat("Profit so far", profit), stat("Best month", best), stat("Worst month", worst)]} />

      {lastUpdate && <AppText size="xs" color="inkDim" style={styles.fresh}>Value last updated {lastUpdate}</AppText>}

      {points.length < 3 && (
        <AppText size="xs" color="inkDim" style={styles.fresh}>
          Your history starts {points[0]?.label} — it fills in as the months go by.
        </AppText>
      )}

      <Card style={styles.card}>
        <Caps>Value</Caps>
        <ValueHistoryChart key={`v-${scope}-${range}`} points={points} activeIndex={tip?.chart === "value" ? tip.i : null} onScrub={(i) => setTip(i === null ? null : { chart: "value", i })} />
      </Card>

      <Card style={styles.card}>
        <Caps>Profit / loss</Caps>
        <ProfitChart key={`p-${scope}-${range}`} points={points} growth={growth} activeIndex={tip?.chart === "profit" ? tip.i : null} onScrub={(i) => setTip(i === null ? null : { chart: "profit", i })} />
        <AppText size="xs" color="inkDim">Profit or loss from value updates — money you add isn't counted as growth.</AppText>
      </Card>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  strip: { gap: 6, paddingRight: spacing.lg },
  fresh: { paddingHorizontal: 2 },
  card: { gap: spacing.sm },
});

export default TrendsView;
