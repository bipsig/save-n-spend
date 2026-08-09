import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import type { InsightsPeriod } from "@save-n-spend/types";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import GradientCard from "@/components/shell/GradientCard";
import Card from "@/components/data/Card";
import ShareBar from "@/components/data/ShareBar";
import AreaChart from "@/components/charts/AreaChart";
import PairedColumns from "@/components/charts/PairedColumns";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Icon from "@/components/ui/Icon";
import { AppText } from "@/components/ui/AppText";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import SkeletonState from "@/components/states/SkeletonState";
import formatMoney from "@/lib/money";
import {
  useInsights,
  foldCategories,
  accountShares,
  seriesStats,
  pctChange,
  buildTrend,
} from "@/lib/insights";
import { colors, radius, spacing, incomeColor, expenseColor } from "@/theme";

const SEGMENTS: { key: InsightsPeriod; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const seriesLabel = (iso: string, period: InsightsPeriod) => {
  const d = new Date(iso);
  if (period === "year") return `${d.getUTCFullYear()}`;
  if (period === "month") return MONTHS[d.getUTCMonth()];
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
};

const unitsWord = (period: InsightsPeriod) =>
  period === "year" ? "YEARS" : period === "week" ? "WEEKS" : "MONTHS";

// Monday-start of the week that is `offset` weeks from the current one.
const weekStart = (offset: number) => {
  const now = new Date();
  const sinceMonday = (now.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - sinceMonday + offset * 7));
};

// The human label for the window the navigator points at. Current/previous read
// friendly ("This Month" / "Last Month"); anything older is concrete.
const windowLabel = (period: InsightsPeriod, offset: number): string => {
  const now = new Date();
  if (offset === 0) return period === "week" ? "This Week" : period === "month" ? "This Month" : "This Year";
  if (offset === -1) return period === "week" ? "Last Week" : period === "month" ? "Last Month" : "Last Year";

  if (period === "year") return `${now.getUTCFullYear() + offset}`;
  if (period === "month") {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    return `${MONTHS_FULL[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  const start = weekStart(offset);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 6));
  return start.getUTCMonth() === end.getUTCMonth()
    ? `${start.getUTCDate()}–${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]}`
    : `${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]} – ${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]}`;
};

// Short label for the unit just before the shown window (delta "vs …").
const prevLabel = (period: InsightsPeriod, offset: number): string => {
  const now = new Date();
  if (period === "year") return `${now.getUTCFullYear() + offset - 1}`;
  if (period === "week") return "prev wk";
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset - 1, 1));
  return MONTHS[d.getUTCMonth()];
};

const Caps = ({ children }: { children: React.ReactNode }) => (
  <AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>
    {children}
  </AppText>
);

const LegendDot = ({ color, label }: { color: string; label: string }) => (
  <View style={styles.legendItem}>
    <View style={[styles.dot, { backgroundColor: color }]} />
    <AppText size="xs" color="inkDim">
      {label}
    </AppText>
  </View>
);

// Coloured delta — green when the change is in the good direction. `pill` gives
// the spec .dchip badge (the spending hero); plain text for the KPI tiles.
const Delta = ({
  value,
  goodWhen,
  vs = "prev",
  pill = false,
}: {
  value: number;
  goodWhen: "down" | "up";
  vs?: string;
  pill?: boolean;
}) => {
  const rounded = Math.round(value);
  const good = goodWhen === "down" ? rounded <= 0 : rounded >= 0;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  const text = `${sign}${Math.abs(rounded)}% vs ${vs}`;

  if (!pill) {
    return (
      <AppText size="xs" weight="semibold" color={good ? "success" : "danger"}>
        {text}
      </AppText>
    );
  }

  return (
    <View style={[styles.pill, { backgroundColor: good ? "rgba(52,224,161,0.16)" : "rgba(255,107,116,0.16)" }]}>
      <AppText size="xs" weight="bold" color={good ? "success" : "danger"}>
        {text}
      </AppText>
    </View>
  );
};

const Kpi = ({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) => (
  <Card style={styles.kpi}>
    <AppText size="xs" color="inkDim" style={styles.caps}>
      {label}
    </AppText>
    <AppText size="lg" weight="black" numberOfLines={1}>
      {value}
    </AppText>
    {children}
  </Card>
);

// Step backward/forward through periods. Forward is disabled at the current
// window (no peeking into the future).
const PeriodNav = ({
  label,
  canNext,
  onPrev,
  onNext,
}: {
  label: string;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) => (
  <View style={styles.nav}>
    <Pressable onPress={onPrev} hitSlop={8} style={styles.navBtn}>
      <Icon name="chevronLeft" size={24} color="ink" />
    </Pressable>
    <AppText size="md" weight="bold" numberOfLines={1}>
      {label}
    </AppText>
    <Pressable
      onPress={onNext}
      disabled={!canNext}
      hitSlop={8}
      style={[styles.navBtn, !canNext && styles.navBtnOff]}
    >
      <Icon name="chevronRight" size={24} color={canNext ? "ink" : "inkDim"} />
    </Pressable>
  </View>
);

const InsightsScreen = () => {
  const router = useRouter();
  const [period, setPeriod] = useState<InsightsPeriod>("month");
  // 0 = current window, -1 = previous, … (never positive — no future).
  const [offset, setOffset] = useState(0);
  // The one open chart tooltip — screen-owned so a tap anywhere else clears it.
  const [tip, setTip] = useState<{ chart: "trend" | "income" | "account"; i: number } | null>(null);
  const { data, loading, error, refetch } = useInsights(period, offset);

  // Switching period type always re-anchors to the current week/month/year.
  const changePeriod = (p: InsightsPeriod) => {
    setPeriod(p);
    setOffset(0);
    setTip(null);
  };

  const goPrev = () => {
    setOffset((o) => o - 1);
    setTip(null);
  };

  const goNext = () => {
    setOffset((o) => Math.min(0, o + 1));
    setTip(null);
  };

  useFocusEffect(useCallback(() => {
    refetch();
  }, [refetch]));

  const renderBody = () => {
    if (error) return <ErrorState message={error} onRetry={refetch} />;

    if (loading && !data) {
      return (
        <View style={styles.skeletonCol}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonState key={i} height={140} borderRadius={radius.lg} />
          ))}
        </View>
      );
    }

    if (!data || data.txnCount === 0) {
      return (
        <EmptyState
          icon="insights"
          title="A week of spending unlocks your trends"
          subtitle="Add a few transactions and your trends, categories and comparisons show up here."
          actionLabel="Add transaction"
          onAction={() => router.push("/add-transaction")}
        />
      );
    }

    const stats = seriesStats(data.incomeVsExpense);
    const trend = buildTrend(data.trend, period, data.periodStart, data.periodEnd);
    const cats = foldCategories(data.byCategory);
    const accts = accountShares(data.byAccount);
    const pairs = data.incomeVsExpense.map((p) => ({ income: p.income, expense: p.expense }));
    const labels = data.incomeVsExpense.map((p) => seriesLabel(p.periodStart, period));
    const top = cats[0];

    const vsLabel = prevLabel(period, offset);

    return (
      <>
        {/* Spending trend */}
        <GradientCard gradient="brand" style={styles.stack}>
          <Caps>SPENDING</Caps>
          <View style={styles.heroRow}>
            <AppText size="xl" weight="black">
              {formatMoney(stats.currentExpense)}
            </AppText>
            <Delta value={stats.spendDeltaPct} goodWhen="down" vs={vsLabel} pill />
          </View>
          <AreaChart
            data={trend.values}
            labels={trend.axis}
            tipLabels={trend.tipLabels}
            color="#B0A2FF"
            activeIndex={tip?.chart === "trend" ? tip.i : null}
            onScrub={(i) => setTip(i === null ? null : { chart: "trend", i })}
          />
        </GradientCard>

        {/* Income vs expense */}
        <Card style={styles.stack}>
          <Caps>{`INCOME VS EXPENSE · 6 ${unitsWord(period)}`}</Caps>
          <View style={styles.legend}>
            <LegendDot color={incomeColor} label="Income" />
            <LegendDot color={expenseColor} label="Expense" />
          </View>
          <PairedColumns
            data={pairs}
            labels={labels}
            activeIndex={tip?.chart === "income" ? tip.i : null}
            onScrub={(i) => setTip(i === null ? null : { chart: "income", i })}
          />
        </Card>

        {/* By category */}
        <Card style={styles.stack}>
          <Caps>BY CATEGORY</Caps>
          {cats.map((c) => (
            <View key={c.id} style={styles.catRow}>
              <View style={styles.catTop}>
                <AppText size="sm" weight="semibold" color={c.id === "others" ? "inkDim" : "ink"} numberOfLines={1} style={styles.catName}>
                  {c.name}
                </AppText>
                <AppText size="xs" color="inkDim">
                  {`${formatMoney(c.total)} · ${Math.round(c.pct)}%`}
                </AppText>
              </View>
              <View style={styles.catTrack}>
                <View style={[styles.catFill, { width: `${Math.max(c.pct, 2)}%`, backgroundColor: c.color }]} />
              </View>
            </View>
          ))}
        </Card>

        {/* Where it left from */}
        <Card style={styles.stack}>
          <Caps>WHERE IT LEFT FROM</Caps>
          <ShareBar
            data={accts}
            activeIndex={tip?.chart === "account" ? tip.i : null}
            onScrub={(i) => setTip(i === null ? null : { chart: "account", i })}
          />
          <View style={styles.acctLegend}>
            {accts.map((a) => (
              <LegendDot key={a.id} color={a.color} label={`${a.name} ${Math.round(a.pct)}%`} />
            ))}
          </View>
        </Card>

        {/* KPI grid */}
        <View style={styles.kgrid}>
          <Kpi label="AVG DAILY SPEND" value={formatMoney(data.avgDailySpendCurrent)}>
            <Delta value={pctChange(data.avgDailySpendCurrent, data.avgDailySpendPrevious)} goodWhen="down" vs={vsLabel} />
          </Kpi>
          <Kpi label="TOP CATEGORY" value={data.topCategory ?? "—"}>
            {top && (
              <AppText size="xs" color="inkDim">
                {`${formatMoney(top.total)} · ${Math.round(top.pct)}%`}
              </AppText>
            )}
          </Kpi>
          <Kpi label="TRANSACTIONS" value={`${data.txnCount}`}>
            <AppText size="xs" color="inkDim">
              this period
            </AppText>
          </Kpi>
          <Kpi label="SAVINGS RATE" value={`${Math.round(stats.savingsRate)}%`}>
            <Delta value={stats.savingsRateDelta} goodWhen="up" vs={vsLabel} />
          </Kpi>
        </View>
      </>
    );
  };

  return (
    <ScreenScaffold title="Insights">
      {/* Tapping anywhere that isn't a chart clears the open tooltip. */}
      <Pressable style={styles.body} onPress={() => setTip(null)}>
        <SegmentedControl segments={SEGMENTS} value={period} onChange={changePeriod} />
        <PeriodNav
          label={windowLabel(period, offset)}
          canNext={offset < 0}
          onPrev={goPrev}
          onNext={goNext}
        />
        {renderBody()}
      </Pressable>
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  body: {
    gap: spacing.lg,
  },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  navBtnOff: {
    opacity: 0.35,
  },
  stack: {
    gap: 12,
  },
  caps: {
    letterSpacing: 1.2,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  legend: {
    flexDirection: "row",
    gap: spacing.lg,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 3,
  },
  catRow: {
    gap: 6,
  },
  catTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  catName: {
    flex: 1,
  },
  catTrack: {
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.line,
    overflow: "hidden",
  },
  catFill: {
    height: "100%",
    borderRadius: 5,
  },
  acctLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  kgrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  kpi: {
    flexBasis: "47%",
    flexGrow: 1,
    gap: 4,
  },
  skeletonCol: {
    gap: spacing.lg,
  },
});

export default InsightsScreen;
