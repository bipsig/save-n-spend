import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { InsightsPeriod } from "@save-n-spend/types";
import ExportSheet from "@/components/sheets/ExportSheet";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import { screenTitles } from "@/data/menu";
import { relativePeriod } from "@/lib/format/period";
import GradientCard from "@/components/shell/GradientCard";
import Card from "@/components/data/Card";
import ShareBar from "@/components/data/ShareBar";
import TripsList from "@/components/data/TripsList";
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
import Caps from "@/components/ui/Caps";
import ChartLegend from "@/components/ui/ChartLegend";
import StatTile from "@/components/ui/StatTile";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import { AppText } from "@/components/ui/AppText";
import EmptyState from "@/components/states/EmptyState";
import ScreenStates from "@/components/states/ScreenStates";
import SkeletonState from "@/components/states/SkeletonState";
import formatMoney, { groupIndian, usePrivacyMask } from "@/lib/money";
import { count } from "@/lib/format/count";
import { formatPct, formatPoints } from "@/lib/format/pct";
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
import { categoryShares, insightsSpend, isTrips, OTHERS_ID, UNCATEGORISED_ID } from "@/lib/everydaySpend";
import { useAppZone } from "@/lib/zone";
import { colors, radius, spacing, incomeColor, expenseColor, chartValueColor } from "@/theme";
import { signTone, toneSoft } from "@/lib/signTone";
import Money from "@/components/ui/Money";

const SEGMENTS: { key: InsightsPeriod; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

const unitsWord = (period: InsightsPeriod) =>
  period === "year" ? "years" : period === "week" ? "weeks" : period === "day" ? "days" : "months";

type Chart = "trend" | "cumulative" | "donut" | "income" | "account";

// A change written as it is shown (one decimal, D9 C) and coloured by that same rounded figure,
// so "0.0%" is never coloured. `points` is for a change between two rates.
const delta = (value: number, goodWhen: "down" | "up", vs: string, points = false) => {
  const shown = Math.round(value * 10) / 10;
  return {
    text: `${points ? formatPoints(value) : formatPct(value, { kind: "change" })} vs ${vs}`,
    tone: signTone(shown, { goodWhen }),
  };
};

// The spending hero's change, as the spec .dchip badge.
const DeltaPill = ({ value, goodWhen, vs }: { value: number; goodWhen: "down" | "up"; vs: string }) => {
  const { text, tone } = delta(value, goodWhen, vs);
  return (
    <View style={[styles.pill, { backgroundColor: colors[toneSoft(tone)] }]}>
      <AppText size="xs" weight="bold" color={tone}>
        {text}
      </AppText>
    </View>
  );
};

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
  // The Trips row's list of trips; closes with the tooltips when the window changes.
  const [tripsOpen, setTripsOpen] = useState(false);
  const exportRef = useRef<BottomSheetModal>(null);
  const insightsQuery = useInsights(period, offset);
  const { data, loading } = insightsQuery;
  const state = { ...insightsQuery, hasData: insightsQuery.fetchedAt !== null };
  // Always about THIS month, independent of whatever period/offset is selected below —
  // see docs/insights-engine.md. Its own fetch, not threaded through useInsights.
  // `warmingUp` doubles as this screen's own "too new to say anything real" signal —
  // account-wide, unlike the entry count, which is scoped to whichever window is on
  // screen (see the empty-state branch below).
  const { highlights, dismiss, warmingUp } = useHighlights();

  // Switching period type always re-anchors to the current week/month/year.
  const clearTips = () => {
    setTip(null);
    setHeatDay(null);
    setHeatHour(null);
    setTripsOpen(false);
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


  // A What's new link opens the export once the period has loaded; the param is cleared so
  // coming back to this tab doesn't open it again.
  const { export: exportParam, period: periodParam, focus } = useLocalSearchParams<{ export?: string; period?: string; focus?: string }>();
  // Home's Savings tile opens on its own period (`focus` makes a second tap re-apply it).
  useEffect(() => {
    if (periodParam && SEGMENTS.some((s) => s.key === periodParam)) changePeriod(periodParam as InsightsPeriod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodParam, focus]);
  useEffect(() => {
    if (exportParam !== "1" || loading) return;
    if (data && (data.entryCount ?? data.txnCount) > 0) exportRef.current?.present();
    router.setParams({ export: undefined });
  }, [exportParam, loading, data, router]);

  const renderBody = () => {
    // An entry count of 0 only says THIS window is empty — a quiet Tuesday on an
    // account with two years of history looks identical to a brand-new one from that
    // number alone. `warmingUp` is the account-wide signal that tells the two apart, so
    // the three branches below are genuinely different situations, not one fact dressed
    // up three ways: no history at all yet, this window just happens to be quiet but you
    // could still add to it, or this window is closed and adding a transaction now
    // wouldn't even land in it.
    if (!data || (data.entryCount ?? data.txnCount) === 0) {
      if (warmingUp) {
        return (
          <EmptyState
            icon="clock"
            title="A few transactions unlocks your trends"
            subtitle="Categories, comparisons and pace all need something to compare against — add a few and they start filling in."
            actionLabel="Add transaction"
            onAction={() => router.push("/add-transaction")}
          />
        );
      }
      if (offset === 0) {
        return (
          <EmptyState
            icon="insights"
            title={`Nothing logged ${windowLabel(period, 0).toLowerCase()} yet`}
            subtitle="Add a transaction and it shows up here."
            actionLabel="Add transaction"
            onAction={() => router.push("/add-transaction")}
          />
        );
      }
      // A closed window — adding a transaction now goes into today, not into whatever
      // past Day/Week/Month/Year is being looked at, so the CTA that makes sense for the
      // branch above would be actively wrong here.
      return (
        <EmptyState
          icon="insights"
          // A day takes no "in": "No activity yesterday", "No activity on 14 Nov".
          title={period === "day"
            ? `No activity ${relativePeriod(period, offset)?.toLowerCase() ?? `on ${windowLabel(period, offset)}`}`
            : `No activity in ${relativePeriod(period, offset)?.toLowerCase() ?? windowLabel(period, offset)}`}
          subtitle="Nothing was recorded in this window."
        />
      );
    }

    // Every figure holds each closed trip once, on its close day (trips=entries).
    const stats = seriesStats(data.incomeVsExpense);
    const spend = insightsSpend(data.incomeVsExpense);
    const dayTrend = data.trend;
    const averages = { current: data.avgDailySpendCurrent, previous: data.avgDailySpendPrevious };
    const trend = buildTrend(dayTrend, period);
    // The server's shares of all spending; null on an older API, which keeps the 2.8.3 fold.
    const shares = categoryShares(data.byCategory, data.uncategorised);
    const cats = shares ? shares.list : foldCategories(data.byCategory);
    const accts = accountShares(data.byAccount);
    const pairs = spend.columns;
    const labels = data.incomeVsExpense.map((p) => seriesLabel(p.periodStart, period));
    const top = shares ? cats.find((c) => c.id !== OTHERS_ID && c.id !== UNCATEGORISED_ID) : cats[0];

    const vsLabel = prevLabel(period, offset);
    const pace = cumulativePair(dayTrend, data.previousTrend, period);
    const paceDelta = pace.atCurrentEnd.current - pace.atCurrentEnd.previous;
    const movers = compareRows(data.categoryCompare);
    // Only the window in progress has anything left to project — a finished period's
    // "projection" would just be its own already-known total restated. `avgDailySpendCurrent`
    // degenerates for the Day period (see getAverageSpend), so it gets its own client-side
    // hourly projection instead of this one.
    const projection = offset === 0 && period !== "day"
      ? projectPeriod(averages.current, data.periodStart, data.periodEnd, data.timeZone)
      : null;
    const dayProjection = offset === 0 && period === "day" ? projectDay(dayTrend) : null;
    const prevActualExpense = spend.columns[spend.columns.length - 2]?.expense ?? 0;
    // A year's buckets are months, so a 12-cell "calendar" would just be the trend line
    // again — and a day's own hour-of-day pattern gets the strip below instead of this grid.
    const heatmap = period === "year" || period === "day" ? null : buildHeatmap(dayTrend);
    const hourlyPattern = period === "day" ? buildHourlyPattern(dayTrend) : null;
    const donutSlices = (shares ? shares.ring : cats).filter((c) => c.total > 0);
    const spendTotal = shares ? spend.current : cats.reduce((a, c) => a + c.total, 0);
    // The tapped slice's own sub-categories, listed under the ring. "Others" is a fold of
    // several categories, so it has none.
    const openSlice = tip?.chart === "donut" ? donutSlices[tip.i] : undefined;

    return (
      <>
        {/* Spending trend */}
        <GradientCard gradient="brand" style={styles.stack}>
          <Caps>Spending</Caps>
          <View style={styles.heroRow}>
            <Money value={spend.current} size="xl" weight="black" />
            <DeltaPill value={spend.deltaPct} goodWhen="down" vs={vsLabel} />
          </View>
          <AreaChart
            data={trend.values}
            labels={trend.axis}
            tipLabels={trend.tipLabels}
            color={chartValueColor}
            activeIndex={tip?.chart === "trend" ? tip.i : null}
            onScrub={(i) => setTip(i === null ? null : { chart: "trend", i })}
          />
        </GradientCard>

        {/* Pace — running total against the same point last period */}
        <Card style={styles.stack}>
          <Caps>{`Pace vs ${windowLabel(period, offset - 1)}`}</Caps>
          <View style={styles.heroRow}>
            <Money value={pace.atCurrentEnd.current} size="lg" weight="black" />
            <Money value={paceDelta} sign="always" size="sm" weight="semibold" color={signTone(paceDelta, { goodWhen: "down" })} />
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
          <Caps>{`Income vs expense · 6 ${unitsWord(period)}`}</Caps>
          <ChartLegend
            items={[
              { label: "Income", color: incomeColor },
              { label: "Expense", color: expenseColor },
            ]}
          />
          <PairedColumns
            data={pairs}
            labels={labels}
            activeIndex={tip?.chart === "income" ? tip.i : null}
            onScrub={(i) => setTip(i === null ? null : { chart: "income", i })}
          />
        </Card>

        {/* Where it went — the ring, and the tapped slice's own breakdown */}
        <Card style={styles.stack}>
          <Caps>Where it went</Caps>
          <DonutChart
            data={donutSlices}
            centerLabel={shares ? "SPENT" : "TOTAL SPENT"}
            centerValue={spendTotal}
            activeIndex={tip?.chart === "donut" ? tip.i : null}
            onScrub={(i) => setTip(i === null ? null : { chart: "donut", i })}
          />
          {openSlice?.children?.length ? (
            <View style={styles.subList}>
              <Caps>{`Inside ${openSlice.name}`}</Caps>
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
          <Caps>{shares ? "By category · share of spending" : "By category"}</Caps>
          <View style={styles.catList}>
            {cats.map((c) => {
              // "Others" is a fold of several categories and "Uncategorised" is none, so neither
              // has one category to open.
              const openable = c.id !== OTHERS_ID && c.id !== UNCATEGORISED_ID;
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
                        {formatPct(c.pct)}
                      </AppText>
                      {openable && <Icon name={isTrips(c.id) ? (tripsOpen ? "chevronUp" : "chevronDown") : "chevronRight"} size={16} color="inkDim" />}
                    </View>
                  </View>
                  <View style={styles.catTrack}>
                    <View style={[styles.catFill, { width: `${Math.max(c.pct, 2)}%`, backgroundColor: c.color }]} />
                  </View>
                </>
              );

              if (!openable) return <View key={c.id} style={styles.catRow}>{body}</View>;

              // Trips expands in place to the trips closed in the period; each opens its page.
              if (isTrips(c.id)) {
                return (
                  <View key={c.id} style={styles.catList}>
                    <PressableScale
                      style={styles.catRow}
                      accessibilityLabel={`${c.name}, ${formatMoney(c.total)}, ${formatPct(c.pct)}`}
                      accessibilityState={{ expanded: tripsOpen }}
                      onPress={() => setTripsOpen((v) => !v)}
                    >
                      {body}
                    </PressableScale>
                    {tripsOpen && c.children?.length ? <TripsList trips={c.children} /> : null}
                  </View>
                );
              }

              return (
                <PressableScale
                  key={c.id}
                  style={styles.catRow}
                  accessibilityLabel={`${c.name}, ${formatMoney(c.total)}, ${formatPct(c.pct)}`}
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
            <Caps>Daily rhythm</Caps>
            <SpendHeatmap heatmap={heatmap} active={heatDay} onSelect={setHeatDay} />
          </Card>
        )}
        {hourlyPattern && (
          <Card style={styles.stack}>
            <Caps>Hourly rhythm</Caps>
            <HourlyRhythm rhythm={hourlyPattern} active={heatHour} onSelect={setHeatHour} />
          </Card>
        )}

        {/* Biggest movers */}
        {movers.length > 0 && (
          <Card style={styles.stack}>
            <Caps>{`Biggest changes vs ${windowLabel(period, offset - 1)}`}</Caps>
            <CompareBars rows={movers} previousLabel={vsLabel} />
          </Card>
        )}

        {/* Where it left from */}
        <Card style={styles.stack}>
          <Caps>Where it left from</Caps>
          <ShareBar
            title="Where it left from"
            data={accts}
            activeIndex={tip?.chart === "account" ? tip.i : null}
            onScrub={(i) => setTip(i === null ? null : { chart: "account", i })}
          />
          <ChartLegend items={accts.map((a) => ({ label: `${a.name} ${formatPct(a.pct)}`, color: a.color }))} />
        </Card>

        {/* KPI grid */}
        <View style={styles.kgrid}>
          {/* The server's own day-average degenerates to just "today's total" for a window
              this short (see getAverageSpend) — an hourly rate, computed client-side from the
              trend already in hand, is the meaningful figure for the Day tab instead. */}
          {/* Not a StatRow: a category name is a figure here, and a long one would reflow the
              whole grid to one column. Each tile shrinks on its own instead. */}
          {period === "day" ? (
            <StatTile
              size="lg"
              style={styles.kpi}
              label="Avg hourly spend"
              amount={dayProjection?.avgPerHour ?? 0}
              change={{ text: "so far today" }}
            />
          ) : (
            <StatTile
              size="lg"
              style={styles.kpi}
              label="Avg daily spend"
              amount={averages.current}
              change={delta(pctChange(averages.current, averages.previous), "down", vsLabel)}
            />
          )}
          <StatTile
            size="lg"
            style={styles.kpi}
            label="Top category"
            text={(shares ? top?.name : data.topCategory) ?? "—"}
            change={top ? { text: `${formatMoney(top.total)} · ${formatPct(top.pct)}` } : null}
          />
          <StatTile
            size="lg"
            style={styles.kpi}
            label="Transactions"
            text={groupIndian(data.entryCount ?? data.txnCount)}
            change={{ text: "this period" }}
          />
          <StatTile
            size="lg"
            style={styles.kpi}
            label="Savings rate"
            text={formatPct(stats.savingsRate)}
            change={delta(stats.savingsRateDelta, "up", vsLabel, true)}
          />
          {/* Only while the window is still open — a finished period has nothing left to
              project, and this would just restate its own known total. */}
          {projection && (
            <StatTile
              size="lg"
              style={styles.kpi}
              label={`Projected ${windowLabel(period, 0)}`}
              amount={projection.total}
              change={(() => {
                const d = delta(pctChange(projection.total, prevActualExpense), "down", vsLabel);
                return { ...d, text: `${d.text} · ${count(projection.daysRemaining, "day")} left` };
              })()}
            />
          )}
          {dayProjection && (
            <StatTile
              size="lg"
              style={styles.kpi}
              label="Projected today"
              amount={dayProjection.total}
              change={(() => {
                const d = delta(pctChange(dayProjection.total, prevActualExpense), "down", vsLabel);
                return { ...d, text: `${d.text} · ${count(dayProjection.hoursRemaining, "hour")} left` };
              })()}
            />
          )}
        </View>
      </>
    );
  };

  const hasData = !!data && (data.entryCount ?? data.txnCount) > 0;

  return (
    <ScreenScaffold
      title={screenTitles.insights}
      states={state}
      actions={[{ kind: "export", label: "Export insights", disabled: !hasData, onPress: () => exportRef.current?.present() }]}
    >
      {/* Tapping anywhere that isn't a chart clears the open tooltip. Deliberately a
          plain Pressable, not PressableScale: this covers the whole page, so a squeeze
          or a tick here would fire on every stray tap and dip the entire screen.
          `accessible={false}`: a Pressable is one VoiceOver element by default, which
          would read the whole page as a single button. */}
      <Pressable style={styles.body} onPress={clearTips} accessible={false}>
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
        <SegmentedControl segments={SEGMENTS} value={period} onChange={changePeriod} accessibilityLabel="Period" />
        <PeriodNav
          label={windowLabel(period, offset)}
          canNext={offset < 0}
          onPrev={goPrev}
          onNext={goNext}
        />
        <ScreenStates
          state={state}
          skeleton={
            <View style={styles.skeletonCol}>
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonState key={i} height={140} borderRadius={radius.lg} />
              ))}
            </View>
          }
        >
          {renderBody}
        </ScreenStates>
      </Pressable>
      <ExportSheet ref={exportRef} kind="insights" defaultRange={period} defaultOffset={offset} insightsData={data} />
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
    minWidth: 44,
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
  kgrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  kpi: {
    flexBasis: "47%",
    flexGrow: 1,
  },
  skeletonCol: {
    gap: spacing.lg,
  },
});

export default InsightsScreen;
