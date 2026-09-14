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
import DualLineChart from "@/components/charts/DualLineChart";
import DonutChart from "@/components/charts/DonutChart";
import SpendHeatmap from "@/components/charts/SpendHeatmap";
import HourlyRhythm from "@/components/charts/HourlyRhythm";
import CompareBars from "@/components/charts/CompareBars";
import HighlightCard from "@/components/data/HighlightCard";
import SegmentedControl from "@/components/ui/SegmentedControl";
import PeriodNav from "@/components/ui/PeriodNav";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import { AppText } from "@/components/ui/AppText";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import SkeletonState from "@/components/states/SkeletonState";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import {
  useInsights,
  foldCategories,
  accountShares,
  seriesStats,
  pctChange,
  buildTrend,
  cumulativePair,
  buildHeatmap,
  buildHourlyPattern,
  compareRows,
  projectPeriod,
  projectDay,
  seriesLabel,
  windowLabel,
  prevLabel,
} from "@/lib/insights";
import { useHighlights } from "@/lib/highlights";
import { exportInsights } from "@/lib/insightsExport";
import { useAppZone } from "@/lib/zone";
import { toast } from "@/store/toast";
import { colors, radius, spacing, incomeColor, expenseColor } from "@/theme";

const SEGMENTS: { key: InsightsPeriod; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

const unitsWord = (period: InsightsPeriod) =>
  period === "year" ? "YEARS" : period === "week" ? "WEEKS" : period === "day" ? "DAYS" : "MONTHS";

type Chart = "trend" | "cumulative" | "donut" | "income" | "account";

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

const InsightsScreen = () => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below
  useAppZone();     // subscribe: changing the zone in Settings re-labels every window
  const router = useRouter();
  const [period, setPeriod] = useState<InsightsPeriod>("month");
  // 0 = current window, -1 = previous, … (never positive — no future).
  const [offset, setOffset] = useState(0);
  // The one open chart tooltip — screen-owned so a tap anywhere else clears it.
  const [tip, setTip] = useState<{ chart: Chart; i: number } | null>(null);
  // The heatmap's selection is a date, not an index, so it can't share `tip`. The hourly
  // strip's is an hour number for the same reason.
  const [heatDay, setHeatDay] = useState<string | null>(null);
  const [heatHour, setHeatHour] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const { data, loading, error, refetch } = useInsights(period, offset);
  // Always about THIS month, independent of whatever period/offset is selected below —
  // see docs/insights-engine.md. Its own fetch, not threaded through useInsights.
  const { highlights, dismiss } = useHighlights();

  // Switching period type always re-anchors to the current week/month/year.
  const clearTips = () => {
    setTip(null);
    setHeatDay(null);
    setHeatHour(null);
  };

  const changePeriod = (p: InsightsPeriod) => {
    setPeriod(p);
    setOffset(0);
    clearTips();
  };

  const goPrev = () => {
    setOffset((o) => o - 1);
    clearTips();
  };

  const goNext = () => {
    setOffset((o) => Math.min(0, o + 1));
    clearTips();
  };


  // The window in view as a PDF. The data is already in hand, so build and share at once.
  const onExport = async () => {
    if (!data || exporting) return;
    setExporting(true);
    const label = windowLabel(period, offset);
    try {
      await exportInsights(data, period, offset);
      // Names the window: the export is of what's on screen, which may not be this month.
      toast.success(`Insights for ${label} exported`);
    } catch (err) {
      // A toast, not an OS Alert: the same failure the rest of the app reports inline.
      toast.fromError(err, "Couldn't export your insights. Try again.");
    } finally {
      setExporting(false);
    }
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
    const trend = buildTrend(data.trend, period);
    const cats = foldCategories(data.byCategory);
    const accts = accountShares(data.byAccount);
    const pairs = data.incomeVsExpense.map((p) => ({ income: p.income, expense: p.expense }));
    const labels = data.incomeVsExpense.map((p) => seriesLabel(p.periodStart, period));
    const top = cats[0];

    const vsLabel = prevLabel(period, offset);
    const pace = cumulativePair(data.trend, data.previousTrend, period);
    const paceDelta = pace.atCurrentEnd.current - pace.atCurrentEnd.previous;
    const movers = compareRows(data.categoryCompare);
    // Only the window in progress has anything left to project — a finished period's
    // "projection" would just be its own already-known total restated. `avgDailySpendCurrent`
    // degenerates for the Day period (see getAverageSpend), so it gets its own client-side
    // hourly projection instead of this one.
    const projection = offset === 0 && period !== "day"
      ? projectPeriod(data.avgDailySpendCurrent, data.periodStart, data.periodEnd, data.timeZone)
      : null;
    const dayProjection = offset === 0 && period === "day" ? projectDay(data.trend) : null;
    const prevActualExpense = data.incomeVsExpense[data.incomeVsExpense.length - 2]?.expense ?? 0;
    // A year's buckets are months, so a 12-cell "calendar" would just be the trend line
    // again — and a day's own hour-of-day pattern gets the strip below instead of this grid.
    const heatmap = period === "year" || period === "day" ? null : buildHeatmap(data.trend);
    const hourlyPattern = period === "day" ? buildHourlyPattern(data.trend) : null;
    const donutSlices = cats.filter((c) => c.total > 0);
    const spendTotal = cats.reduce((a, c) => a + c.total, 0);
    // The tapped slice's own sub-categories, listed under the ring. "Others" is a fold of
    // several categories, so it has none.
    const openSlice = tip?.chart === "donut" ? donutSlices[tip.i] : undefined;

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

        {/* Pace — running total against the same point last period */}
        <Card style={styles.stack}>
          <Caps>{`PACE VS ${windowLabel(period, offset - 1).toUpperCase()}`}</Caps>
          <View style={styles.heroRow}>
            <AppText size="lg" weight="black">
              {formatMoney(pace.atCurrentEnd.current)}
            </AppText>
            <AppText size="sm" weight="semibold" color={paceDelta <= 0 ? "success" : "danger"}>
              {`${paceDelta > 0 ? "+" : "−"}${formatMoney(Math.abs(paceDelta))}`}
            </AppText>
          </View>
          {/* Says what the figure above is measured against, because "so far" is the whole
              point: the previous line runs to the end of its period, but the comparison is
              taken at the same day, not at its finish. */}
          <AppText size="xs" color="inkDim">
            {paceDelta === 0
              ? "Level with the same point last time"
              : paceDelta > 0
                ? "Ahead of where you were at this point"
                : "Behind where you were at this point"}
          </AppText>
          <DualLineChart
            current={pace.current}
            previous={pace.previous}
            projectedEnd={projection?.total ?? dayProjection?.total}
            labels={pace.labels}
            currentLabel={windowLabel(period, offset)}
            previousLabel={windowLabel(period, offset - 1)}
            activeIndex={tip?.chart === "cumulative" ? tip.i : null}
            onScrub={(i) => setTip(i === null ? null : { chart: "cumulative", i })}
          />
        </Card>

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

        {/* Where it went — the ring, and the tapped slice's own breakdown */}
        <Card style={styles.stack}>
          <Caps>WHERE IT WENT</Caps>
          <DonutChart
            data={donutSlices}
            centerLabel="TOTAL SPENT"
            centerValue={spendTotal}
            activeIndex={tip?.chart === "donut" ? tip.i : null}
            onScrub={(i) => setTip(i === null ? null : { chart: "donut", i })}
          />
          {openSlice?.children?.length ? (
            <View style={styles.subList}>
              <Caps>{`INSIDE ${openSlice.name.toUpperCase()}`}</Caps>
              {openSlice.children.map((child) => (
                <View key={child.categoryId} style={styles.subRow}>
                  <AppText size="sm" numberOfLines={1} style={styles.catName}>
                    {child.name}
                  </AppText>
                  <AppText size="sm" weight="semibold">
                    {formatMoney(child.total)}
                  </AppText>
                </View>
              ))}
            </View>
          ) : (
            <AppText size="xs" color="inkDim" style={styles.centered}>
              {openSlice ? "No sub-categories under this one" : "Tap a slice for its breakdown"}
            </AppText>
          )}
        </Card>

        {/* By category */}
        <Card style={styles.stack}>
          <Caps>BY CATEGORY</Caps>
          <View style={styles.catList}>
            {cats.map((c) => {
              // "Others" is a fold of several categories, so there is no one category to open.
              const openable = c.id !== "others";
              const body = (
                <>
                  <View style={styles.catTop}>
                    <View style={styles.catNameRow}>
                      <View style={[styles.catDot, { backgroundColor: c.color }]} />
                      <AppText
                        size="md"
                        weight={openable ? "bold" : "semibold"}
                        color={openable ? "ink" : "inkDim"}
                        numberOfLines={1}
                        style={styles.catName}
                      >
                        {c.name}
                      </AppText>
                    </View>
                    <View style={styles.catMeta}>
                      <AppText size="sm" weight="bold" color={openable ? "ink" : "inkDim"}>
                        {formatMoney(c.total)}
                      </AppText>
                      <AppText size="xs" color="inkDim" style={styles.catPct}>
                        {`${Math.round(c.pct)}%`}
                      </AppText>
                      {openable && <Icon name="chevronRight" size={16} color="inkDim" />}
                    </View>
                  </View>
                  <View style={styles.catTrack}>
                    <View style={[styles.catFill, { width: `${Math.max(c.pct, 2)}%`, backgroundColor: c.color }]} />
                  </View>
                </>
              );

              if (!openable) return <View key={c.id} style={styles.catRow}>{body}</View>;

              return (
                <PressableScale
                  key={c.id}
                  style={styles.catRow}
                  onPress={() =>
                    router.push({
                      pathname: "/category-insights",
                      // The window travels with the tap: the detail screen opens on the same
                      // month the user was looking at, not on the current one.
                      params: { id: c.id, name: c.name, period, offset: `${offset}` },
                    })
                  }
                >
                  {body}
                </PressableScale>
              );
            })}
          </View>
        </Card>

        {/* Daily rhythm — or, on the Day tab, the hour-of-day equivalent */}
        {heatmap && (
          <Card style={styles.stack}>
            <Caps>DAILY RHYTHM</Caps>
            <SpendHeatmap heatmap={heatmap} active={heatDay} onSelect={setHeatDay} />
          </Card>
        )}
        {hourlyPattern && (
          <Card style={styles.stack}>
            <Caps>HOURLY RHYTHM</Caps>
            <HourlyRhythm rhythm={hourlyPattern} active={heatHour} onSelect={setHeatHour} />
          </Card>
        )}

        {/* Biggest movers */}
        {movers.length > 0 && (
          <Card style={styles.stack}>
            <Caps>{`BIGGEST CHANGES VS ${windowLabel(period, offset - 1).toUpperCase()}`}</Caps>
            <CompareBars rows={movers} previousLabel={vsLabel} />
          </Card>
        )}

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
          {/* The server's own day-average degenerates to just "today's total" for a window
              this short (see getAverageSpend) — an hourly rate, computed client-side from the
              trend already in hand, is the meaningful figure for the Day tab instead. */}
          {period === "day" ? (
            <Kpi label="AVG HOURLY SPEND" value={formatMoney(dayProjection?.avgPerHour ?? 0)}>
              <AppText size="xs" color="inkDim">
                so far today
              </AppText>
            </Kpi>
          ) : (
            <Kpi label="AVG DAILY SPEND" value={formatMoney(data.avgDailySpendCurrent)}>
              <Delta value={pctChange(data.avgDailySpendCurrent, data.avgDailySpendPrevious)} goodWhen="down" vs={vsLabel} />
            </Kpi>
          )}
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
          {/* Only while the window is still open — a finished period has nothing left to
              project, and this would just restate its own known total. */}
          {projection && (
            <Kpi label={`PROJECTED ${windowLabel(period, 0).toUpperCase()}`} value={formatMoney(projection.total)}>
              <Delta value={pctChange(projection.total, prevActualExpense)} goodWhen="down" vs={vsLabel} />
              <AppText size="xs" color="inkDim">
                {`${projection.daysRemaining} day${projection.daysRemaining === 1 ? "" : "s"} left`}
              </AppText>
            </Kpi>
          )}
          {dayProjection && (
            <Kpi label="PROJECTED TODAY" value={formatMoney(dayProjection.total)}>
              <Delta value={pctChange(dayProjection.total, prevActualExpense)} goodWhen="down" vs={vsLabel} />
              <AppText size="xs" color="inkDim">
                {`${dayProjection.hoursRemaining} hour${dayProjection.hoursRemaining === 1 ? "" : "s"} left`}
              </AppText>
            </Kpi>
          )}
        </View>
      </>
    );
  };

  const hasData = !!data && data.txnCount > 0;

  return (
    <ScreenScaffold
      title="Insights"
      headerRight={
        <Button
          label="Export"
          icon="download"
          pill
          size="sm"
          variant="secondary"
          loading={exporting}
          disabled={!hasData}
          onPress={onExport}
        />
      }
    >
      {/* Tapping anywhere that isn't a chart clears the open tooltip. Deliberately a
          plain Pressable, not PressableScale: this covers the whole page, so a squeeze
          or a tick here would fire on every stray tap and dip the entire screen. */}
      <Pressable style={styles.body} onPress={clearTips}>
        {/* Always about THIS month, whatever period/offset the charts below are showing —
            see docs/insights-engine.md. Absent entirely when there's nothing to say, the
            same as the daily digest staying quiet on an empty day: no header, no "all
            clear" copy here — those belong to the dedicated Assistant screen. */}
        {highlights.length > 0 && (
          <View style={styles.highlights}>
            {highlights.map((highlight) => (
              <HighlightCard key={highlight.key} highlight={highlight} onDismiss={dismiss} />
            ))}
          </View>
        )}
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
  highlights: {
    gap: spacing.sm,
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
  catList: {
    gap: 18, // more air between rows so the card doesn't read congested
    marginTop: 2,
  },
  catRow: {
    gap: 10,
  },
  catTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  catNameRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  catDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  catName: {
    flex: 1,
  },
  catMeta: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  catPct: {
    minWidth: 34,
    textAlign: "right",
  },
  catTrack: {
    height: 10,
    borderRadius: 6,
    backgroundColor: colors.line,
    overflow: "hidden",
  },
  catFill: {
    height: "100%",
    borderRadius: 6,
  },
  centered: {
    textAlign: "center",
  },
  subList: {
    gap: 10,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
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
