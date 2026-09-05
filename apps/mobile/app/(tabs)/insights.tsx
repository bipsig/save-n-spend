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
import PeriodNav from "@/components/ui/PeriodNav";
import Button from "@/components/ui/Button";
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
} from "@/lib/insights";
import { exportInsights } from "@/lib/insightsExport";
import { appZone, calendarFromKey, calendarToday, useAppZone } from "@/lib/zone";
import { toast } from "@/store/toast";
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

// `periodStart` is a bare calendar key ("2026-08-01") the server already cut in the
// user's zone, so it is read field-by-field and never re-read as a moment.
const seriesLabel = (key: string, period: InsightsPeriod) => {
  const d = calendarFromKey(key);
  if (period === "year") return `${d.getUTCFullYear()}`;
  if (period === "month") return MONTHS[d.getUTCMonth()];
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
};

const unitsWord = (period: InsightsPeriod) =>
  period === "year" ? "YEARS" : period === "week" ? "WEEKS" : "MONTHS";

// The three label helpers below all anchor on today WHERE THE USER IS, then do plain
// `Date.UTC` arithmetic on that calendar date (see lib/zone). Anchoring on `new Date()`
// and reading `getUTC*` off it — which is what these used to do — names the wrong
// window for a third of every Indian day: past 5:30am IST the UTC date is still
// yesterday, so on the 1st of a month "This Month" would have labelled the previous one.
const anchor = (): Date => calendarToday(appZone());

// Monday-start of the week that is `offset` weeks from the current one.
const weekStart = (offset: number) => {
  const now = anchor();
  const sinceMonday = (now.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - sinceMonday + offset * 7));
};

// The human label for the window the navigator points at. Current/previous read
// friendly ("This Month" / "Last Month"); anything older is concrete.
const windowLabel = (period: InsightsPeriod, offset: number): string => {
  if (offset === 0) return period === "week" ? "This Week" : period === "month" ? "This Month" : "This Year";
  if (offset === -1) return period === "week" ? "Last Week" : period === "month" ? "Last Month" : "Last Year";

  const now = anchor();
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
  const now = anchor();
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

const InsightsScreen = () => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below
  useAppZone();     // subscribe: changing the zone in Settings re-labels every window
  const router = useRouter();
  const [period, setPeriod] = useState<InsightsPeriod>("month");
  // 0 = current window, -1 = previous, … (never positive — no future).
  const [offset, setOffset] = useState(0);
  // The one open chart tooltip — screen-owned so a tap anywhere else clears it.
  const [tip, setTip] = useState<{ chart: "trend" | "income" | "account"; i: number } | null>(null);
  const [exporting, setExporting] = useState(false);
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

  // Export the window in view as a PDF of the graphs — the data's already in
  // hand, so build and hand off to the share sheet straight away.
  const onExport = async () => {
    if (!data || exporting) return;
    setExporting(true);
    const label = windowLabel(period, offset);
    try {
      await exportInsights(data, period, label);
      // Names the window, because the export is of what's on screen and the user may
      // have navigated periods several times before pressing it.
      toast.success(`Insights for ${label} exported`);
    } catch (err) {
      // A toast rather than the OS Alert this used to raise: it's the same failure the
      // rest of the app reports, and it shouldn't be the one place that blocks the
      // screen with a modal to say so.
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
          {/* Every row here is a top-level heading — the server folds a sub-category's
              spend into its parent before this list is built. Said once, because
              otherwise the figures look wrong to anyone who files by sub-category and
              goes looking for "Groceries" in the breakdown. */}
          <AppText size="xs" color="inkDim">
            Sub-category spending is counted in its parent.
          </AppText>
          <View style={styles.catList}>
            {cats.map((c) => (
              <View key={c.id} style={styles.catRow}>
                <View style={styles.catTop}>
                  <View style={styles.catNameRow}>
                    <View style={[styles.catDot, { backgroundColor: c.color }]} />
                    <AppText
                      size="md"
                      weight={c.id === "others" ? "semibold" : "bold"}
                      color={c.id === "others" ? "inkDim" : "ink"}
                      numberOfLines={1}
                      style={styles.catName}
                    >
                      {c.name}
                    </AppText>
                  </View>
                  <View style={styles.catMeta}>
                    <AppText size="sm" weight="bold" color={c.id === "others" ? "inkDim" : "ink"}>
                      {formatMoney(c.total)}
                    </AppText>
                    <AppText size="xs" color="inkDim" style={styles.catPct}>
                      {`${Math.round(c.pct)}%`}
                    </AppText>
                  </View>
                </View>
                <View style={styles.catTrack}>
                  <View style={[styles.catFill, { width: `${Math.max(c.pct, 2)}%`, backgroundColor: c.color }]} />
                </View>
              </View>
            ))}
          </View>
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
