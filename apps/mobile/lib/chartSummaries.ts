import type { GrowthPoint, MonthPoint } from "@save-n-spend/types";
import { chartSummary, extremeIndex, peakPhrase, type FormatMoney } from "@/lib/chartSummary";
import { formatMoneyExact } from "@/lib/format/money";
import { formatPct } from "@/lib/format/pct";
import { MONTHS } from "@/lib/format/date";
import { count } from "@/lib/format/count";
import { appZone, zonedParts } from "@/lib/zone";

// The one VoiceOver sentence for each money chart (D20 A), built from the figures the chart
// draws. Pure, so it's tested under node (lib/chartSummaries.test.ts). Masking is
// chartSummary's job: with privacy on, every fact is replaced by "Amounts hidden".

const exact: FormatMoney = (p) => formatMoneyExact(p);
const signed: FormatMoney = (p) => formatMoneyExact(p, { sign: "always" });

/** "on 12 Nov", "in Sep 2026", "at 9 pm": the word that fits the chart's own labels. */
export const prepositionFor = (label: string): string => {
  if (/\b(am|pm)$/.test(label)) return "at";
  if (/^[A-Z][a-z]{2,8} \d{4}$/.test(label) || MONTHS.includes(label) || /^\d{4}$/.test(label)) return "in";
  return "on";
};

const peak = (values: readonly number[], labels: readonly string[], which: "max" | "min" = "max", word?: string) => {
  const i = extremeIndex(values, which);
  const preposition = i === null ? "on" : prepositionFor(labels[i] ?? "");
  return peakPhrase(values, labels, which === "max" ? exact : signed, { which, word, preposition });
};

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** AreaChart: "Spending, chart. ₹42,318.40 in all, highest ₹4,200.00 on 12 Nov." */
export const areaSummary = (title: string, values: readonly number[], labels: readonly string[], masked: boolean) =>
  chartSummary({
    title,
    masked,
    parts: values.length ? [`${exact(sum(values))} in all`, peak(values, labels)] : [],
  });

/** DualLineChart: the current running total, the previous one at the same point, the projection. */
export const dualLineSummary = (
  { current, previous, currentLabel, previousLabel, projectedEnd }: {
    current: readonly number[];
    previous: readonly number[];
    currentLabel: string;
    previousLabel: string;
    projectedEnd?: number;
  },
  masked: boolean,
) => {
  const at = current.length - 1;
  const prevAt = previous.length ? previous[Math.min(at, previous.length - 1)] : null;
  return chartSummary({
    title: `${currentLabel} against ${previousLabel}`,
    masked,
    parts: at < 0 ? [] : [
      `${currentLabel} ${exact(current[at])} so far`,
      prevAt !== null && `${previousLabel} ${exact(prevAt)} at the same point`,
      projectedEnd !== undefined && `on pace for ${exact(projectedEnd)}`,
    ],
  });
};

/** PairedColumns: the latest unit's two figures, then the heaviest spending unit. */
export const pairedSummary = (data: readonly { income: number; expense: number }[], labels: readonly string[], masked: boolean) => {
  const last = data.length - 1;
  const expenses = data.map((d) => d.expense);
  return chartSummary({
    title: "Income and expenses",
    masked,
    parts: last < 0 ? [] : [
      `${labels[last] ?? "latest"}: income ${exact(data[last].income)}, expenses ${exact(data[last].expense)}`,
      peak(expenses, labels, "max", "highest spending"),
    ],
  });
};

/** DonutChart: the whole, then the three biggest slices with their shares (Trips is a slice
 *  like any other). */
export const donutSummary = (
  title: string,
  total: number,
  slices: readonly { name: string; pct: number; total?: number }[],
  masked: boolean,
) => {
  const shareList = slices.slice(0, 3).map((s) => `${s.name} ${formatPct(s.pct)}`).join(", ");
  return chartSummary({ title, masked, parts: slices.length ? [`${exact(total)} in all`, shareList] : [] });
};

/** ValueHistoryChart: where the value and the money put in stand at the latest month. */
export const valueHistorySummary = (points: readonly MonthPoint[], masked: boolean) => {
  const last = points[points.length - 1];
  return chartSummary({
    title: "Value over time",
    masked,
    parts: last ? [
      `${exact(last.value)} in ${last.label}`,
      `${exact(last.invested)} invested`,
      `${signed(last.value - last.invested)} gain`,
    ] : [],
  });
};

/** ProfitChart: profit so far, then the best and worst months by growth. */
export const profitSummary = (points: readonly MonthPoint[], growth: readonly GrowthPoint[], masked: boolean) => {
  const last = points[points.length - 1];
  const counted = growth.map((g) => (g.upd && !g.opening && g.growth !== null ? g.growth : null));
  const labels = growth.map((g) => g.label);
  const best = extremeIndex(counted, "max");
  const worst = extremeIndex(counted, "min");
  return chartSummary({
    title: "Profit and loss",
    masked,
    parts: last ? [
      `${signed(last.value - last.invested)} profit so far`,
      best !== null && (counted[best] as number) > 0 && `best month ${signed(counted[best] as number)} in ${labels[best]}`,
      worst !== null && (counted[worst] as number) < 0 && `worst month ${signed(counted[worst] as number)} in ${labels[worst]}`,
    ] : [],
  });
};

/** ForecastLine: where the projected balance ends, and whether it dips below zero first. */
export const forecastSummary = (series: readonly number[], masked: boolean) =>
  chartSummary({
    title: "Balance forecast to month end",
    masked,
    parts: series.length ? [
      `ends at ${exact(series[series.length - 1])}`,
      series.some((v) => v < 0) ? "goes below zero before then" : "stays above zero",
    ] : [],
  });

/** Investment detail's sparkline: "Value over 8 months, chart. From ₹1,00,000.00 to ₹1,12,400.00."
 *  `since` is the holding's first recorded entry; months are counted in the account zone. */
export const holdingSparkSummary = (values: readonly number[], since: string | undefined, masked: boolean, now = new Date()) => {
  let title = "Value over time";
  if (since) {
    const zone = appZone();
    const a = zonedParts(new Date(since), zone);
    const b = zonedParts(now, zone);
    const months = Math.max(0, (b.year - a.year) * 12 + (b.month - a.month));
    title = months === 0 ? "Value this month" : `Value over ${count(months, "month")}`;
  }
  return chartSummary({
    title,
    masked,
    parts: values.length >= 2 ? [`from ${exact(values[0])} to ${exact(values[values.length - 1])}`] : [],
  });
};
