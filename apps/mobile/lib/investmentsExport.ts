import type { GrowthPoint, HoldingTrend, InvestmentReport, LedgerEntry, MonthPoint, PortfolioGrowth, PortfolioPoint } from "@save-n-spend/types";
import { get } from "@/lib/api";
import { deliver, dayStamp, type ExportFormat, type ExportResult } from "@/lib/export";
import { htmlEscape, kpiCard, kpiRow, pdfDocument } from "@/lib/pdfShell";
import { formatCompactExact } from "@/lib/format/compact";
import { formatPct } from "@/lib/format/pct";
import { formatCalendar, formatInstant } from "@/lib/format/date";
import { count } from "@/lib/format/count";
import {
  bestWorst, ledgerCsv, ledgerInPeriod, periodBounds, periodLabel, slicePeriod,
  type Period, type SectionKey,
} from "@/lib/investmentsReportMath";
import { formatMoneyExact as formatMoney } from "@/lib/money";
import { appZone, dayKey, monthKeyOf } from "@/lib/zone";
import { chartPalette, chartOthers } from "@/theme";

// The Investments statement: a PDF whose sections the user picks, or the ledger as a CSV.
// One request returns everything (see the API's getInvestmentReport); scope and period are
// applied here, so changing either never needs another round trip.

export type InvestmentsExportOptions = {
  /** A holding's id, or null for the whole portfolio. */
  holdingId: string | null;
  period: Period;
  sections: SectionKey[];
  format: ExportFormat;
};

export const fetchInvestmentReport = () => get<InvestmentReport>("/investments/report", { cache: false });

const AXIS = "#9995ad";
const GRID = "#eeecf6";
const VIOLET = "#6D5CFF";
const TEAL = "#2DD4BF";
const UP = "#0f9d63";
const DOWN = "#d64550";

const signed = (n: number) => formatMoney(n, { sign: "always" });
const tone = (n: number): "pos" | "neg" | "" => (n > 0 ? "pos" : n < 0 ? "neg" : "");
const money = (n: number) => htmlEscape(formatMoney(n));
const sgn = (n: number) => htmlEscape(signed(n));
const ret = (pct: number) => formatPct(pct, { kind: "return" });
// The same day shape the screens print, always with the year: a statement outlives the year.
const day = (iso: string) => formatInstant(iso, "dayYear");

// Charts, as vector SVG.

const W = 540, PAD_L = 8, PAD_R = 44;

const xs = (n: number) => (k: number) => PAD_L + ((W - PAD_L - PAD_R) / n) * (k + 0.5);

const axisLabels = (labels: string[], h: number, x: (k: number) => number) => {
  const step = Math.ceil(labels.length / 8);
  return labels
    .map((l, k) => (k % step === 0 || k === labels.length - 1 ? `<text x="${x(k).toFixed(1)}" y="${h - 4}" text-anchor="middle" font-size="8" fill="${AXIS}">${htmlEscape(l)}</text>` : ""))
    .join("");
};

const valueSvg = (points: MonthPoint[]): string => {
  const h = 130, top = 8, bottom = 18;
  const all = points.flatMap((p) => [p.value, p.invested]);
  const hi = Math.max(...all, 1);
  const lo = Math.max(0, Math.min(...all) * 0.94);
  const y = (v: number) => top + (1 - (v - lo) / (hi - lo || 1)) * (h - top - bottom);
  const x = xs(points.length);
  const grid = [0, 1, 2, 3].map((i) => {
    const v = lo + ((hi - lo) * i) / 3;
    return `<line x1="0" x2="${W - PAD_R + 4}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${GRID}"/><text x="${W - PAD_R + 8}" y="${(y(v) + 3).toFixed(1)}" font-size="8" fill="${AXIS}">${htmlEscape(formatCompactExact(v))}</text>`;
  }).join("");
  const line = (key: "value" | "invested", color: string, w: number) =>
    `<polyline fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" points="${points.map((p, k) => `${x(k).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ")}"/>`;
  return `<svg width="${W}" height="${h}" viewBox="0 0 ${W} ${h}">${grid}${line("invested", TEAL, 1.5)}${line("value", VIOLET, 2.4)}${axisLabels(points.map((p) => p.label), h, x)}</svg>`;
};

const profitSvg = (points: MonthPoint[], growth: GrowthPoint[]): string => {
  const h = 190, topH = 100, gap = 16, bottom = 18;
  const profit = points.map((p) => p.value - p.invested);
  const hi = Math.max(...profit, 0), lo = Math.min(...profit, 0);
  const pad = (hi - lo || 1) * 0.12;
  const y = (v: number) => 6 + (1 - (v - (lo - pad)) / (hi + pad - (lo - pad))) * (topH - 12);
  const x = xs(points.length);
  const z = y(0);
  const g = (v: number | null) => v ?? 0;
  const big = Math.max(...growth.map((r) => Math.abs(g(r.growth))), 1);
  const bz = topH + gap + (h - topH - gap - bottom) / 2;
  const half = (h - topH - gap - bottom) / 2 - 3;
  const bw = Math.min(14, ((W - PAD_L - PAD_R) / points.length) * 0.6);
  const bars = growth.map((r, k) => {
    if (r.opening || r.growth === null) return `<rect x="${(x(k) - 3).toFixed(1)}" y="${(bz - 3).toFixed(1)}" width="6" height="6" fill="${AXIS}" transform="rotate(45 ${x(k).toFixed(1)} ${bz.toFixed(1)})"/>`;
    if (!r.upd) return "";
    const bh = Math.max(1.5, (Math.abs(r.growth) / big) * half);
    return `<rect x="${(x(k) - bw / 2).toFixed(1)}" y="${(r.growth >= 0 ? bz - bh : bz).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5" fill="${r.growth >= 0 ? UP : DOWN}"/>`;
  }).join("");
  const last = profit[profit.length - 1];
  return `<svg width="${W}" height="${h}" viewBox="0 0 ${W} ${h}">
    <line x1="0" x2="${W - PAD_R + 4}" y1="${z.toFixed(1)}" y2="${z.toFixed(1)}" stroke="#cfcce0"/>
    <polyline fill="none" stroke="${last >= 0 ? UP : DOWN}" stroke-width="2.4" stroke-linejoin="round" points="${profit.map((v, k) => `${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"/>
    <text x="${W - PAD_R + 8}" y="${(y(last) + 3).toFixed(1)}" font-size="8" font-weight="700" fill="${last >= 0 ? UP : DOWN}">${htmlEscape(formatCompactExact(last, { sign: "always" }))}</text>
    <text x="${PAD_L}" y="${topH + gap - 4}" font-size="7" fill="${AXIS}" letter-spacing="1">MONTHLY CHANGE</text>
    <line x1="0" x2="${W - PAD_R + 4}" y1="${bz.toFixed(1)}" y2="${bz.toFixed(1)}" stroke="#cfcce0"/>${bars}${axisLabels(points.map((p) => p.label), h, x)}</svg>`;
};

// Sections.

type Series = { points: (MonthPoint | PortfolioPoint)[]; growth: (GrowthPoint | PortfolioGrowth)[] };

const summaryCards = (report: InvestmentReport, holdingId: string | null, s: Series, endsToday: boolean): string => {
  const last = s.points[s.points.length - 1];
  const profit = last.value - last.invested;
  const pct = last.invested > 0 ? (profit / last.invested) * 100 : null;
  const holding = holdingId ? report.holdings.find((h) => h.accountId === holdingId) : null;
  const yearly = holding
    ? (holding.annualReturnStatus === "ok" ? holding.annualReturn : null)
    : (report.totals.annualReturnStatus === "ok" ? report.totals.annualReturn : null);
  const per = endsToday && yearly !== null ? ret(yearly * 100) : "—";
  return kpiRow([
    kpiCard("Value", money(last.value)),
    kpiCard("Invested", money(last.invested)),
    kpiCard("Profit", sgn(profit), tone(profit), pct === null ? "" : `${ret(pct)} over what was put in`),
    kpiCard("Per year", per, yearly !== null && endsToday ? tone(yearly) : "", endsToday ? "" : "today only"),
  ]);
};

const bestWorstCards = (s: Series): string => {
  const last = s.points[s.points.length - 1];
  const profit = last.value - last.invested;
  const { best, worst } = bestWorst(s.growth);
  const tile = (label: string, g: GrowthPoint | null) =>
    kpiCard(label, g ? sgn(g.growth as number) : "—", g ? tone(g.growth as number) : "", g ? g.label : "");
  return kpiRow([kpiCard("Profit so far", sgn(profit), tone(profit)), tile("Best month", best), tile("Worst month", worst)]);
};

const allocationHtml = (report: InvestmentReport, point: PortfolioPoint): string => {
  const kindOf = new Map(report.holdings.map((h) => [h.accountId, h.kind]));
  const byKind = new Map<string, number>();
  for (const part of point.parts) byKind.set(kindOf.get(part.id) ?? "Other", (byKind.get(kindOf.get(part.id) ?? "Other") ?? 0) + part.value);
  const total = [...byKind.values()].reduce((a, b) => a + b, 0);
  const rows = [...byKind].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (rows.length === 0 || total <= 0) return "";
  const colour = (i: number) => (i < chartPalette.length ? chartPalette[i] : chartOthers);
  const stack = rows.map(([, v], i) => `<span style="flex:${Math.max((v / total) * 100, 0.5)};background:${colour(i)}"></span>`).join("");
  const legend = rows.map(([k, v], i) => `<span class="ld"><i class="dot" style="background:${colour(i)}"></i>${htmlEscape(k)} · ${formatPct((v / total) * 100)}</span>`).join("");
  return `<h2>Where it's invested</h2><div class="stack">${stack}</div><div class="legend">${legend}</div>`;
};

const holdingsTable = (report: InvestmentReport): string => {
  const started = new Map(report.trend.holdings.map((t) => [t.id, t.points[0]?.label ?? ""]));
  const rows = report.holdings.map((h) => {
    const per = h.annualReturnStatus === "ok" && h.annualReturn !== null ? ret(h.annualReturn * 100) : "—";
    return `<tr><td><div class="desc">${htmlEscape(h.name)}</div><div class="subl">${htmlEscape(h.kind)} · since ${htmlEscape(started.get(h.accountId) ?? "")}</div></td>
      <td class="amt">${money(h.invested)}</td><td class="amt">${money(h.current)}</td>
      <td class="amt ${tone(h.gain)}">${sgn(h.gain)}</td><td class="amt ${h.annualReturn !== null && h.annualReturn < 0 ? "neg" : "pos"}">${per}</td></tr>`;
  }).join("");
  const t = report.totals;
  return `<h2>Holdings · as of today</h2><table><thead><tr><th>Holding</th><th class="amt">Invested</th><th class="amt">Value</th><th class="amt">Gain</th><th class="amt">Per year</th></tr></thead>
    <tbody>${rows}<tr class="total"><td><b>Total</b></td><td class="amt"><b>${money(t.invested)}</b></td><td class="amt"><b>${money(t.current)}</b></td><td class="amt ${tone(t.gain)}"><b>${sgn(t.gain)}</b></td><td class="amt"></td></tr></tbody></table>
    <div class="note">Values are as you entered them — this app doesn't fetch market prices. "Per year" counts each rupee for the time it has been invested and stays blank until about three months of history.</div>`;
};

const monthRows = (points: MonthPoint[], growth: GrowthPoint[]): string => {
  const rows = points.map((p, k) => {
    const g = growth[k];
    const growthCell = g.opening || g.growth === null ? "—" : sgn(g.growth);
    return `<tr><td>${htmlEscape(p.label)}${g.opening ? ' <span class="subl">(opening)</span>' : ""}</td>
      <td class="amt">${p.contrib ? sgn(p.contrib) : "—"}</td><td class="amt ${g.growth ? tone(g.growth) : ""}">${growthCell}</td>
      <td class="amt">${money(p.invested)}</td><td class="amt">${money(p.value)}</td></tr>`;
  }).join("");
  return `<table><thead><tr><th>Month</th><th class="amt">Added</th><th class="amt">Growth</th><th class="amt">Invested</th><th class="amt">Value</th></tr></thead><tbody>${rows}</tbody></table>`;
};

const updateLog = (t: HoldingTrend, months: { from: string; to: string }): string => {
  const rows = t.updates.filter((u) => {
    const m = monthKeyOf(new Date(u.at), appZone());
    return m >= months.from && m <= months.to;
  });
  if (rows.length === 0) return "";
  return `<h2>Value updates</h2><table><tbody>${rows.map((u) => `<tr><td class="nw">${day(u.at)}</td><td class="amt ${tone(u.change)}">${sgn(u.change)}</td><td class="amt">Value after ${money(u.value)}</td></tr>`).join("")}</tbody></table>`;
};

const holdingPage = (t: HoldingTrend, period: Period, withCharts: { value: boolean; profit: boolean }): string => {
  const s = slicePeriod(t.points, t.growth, period);
  if (!s) return "";
  const b = periodBounds(period, t.points.map((p) => p.month)) as { from: string; to: string };
  const last = s.points[s.points.length - 1];
  const profit = last.value - last.invested;
  return `<div class="pb"><div class="hh"><b>${htmlEscape(t.name)}</b></div>
    ${kpiRow([kpiCard("Value", money(last.value)), kpiCard("Invested", money(last.invested)), kpiCard("Profit", sgn(profit), tone(profit))])}
    ${withCharts.value && s.points.length > 1 ? valueSvg(s.points) : ""}
    <h2>Month by month</h2>${monthRows(s.points, s.growth)}${updateLog(t, b)}</div>`;
};

const KIND_LABEL: Record<LedgerEntry["kind"], string> = { added: "Added", in: "Money in", out: "Money out", update: "Value update" };

const ledgerHtml = (entries: LedgerEntry[], showHolding: boolean): string => {
  const rows = entries.map((e) => `<tr><td class="nw">${day(e.at)}</td>${showHolding ? `<td>${htmlEscape(e.holdingName)}</td>` : ""}
    <td>${KIND_LABEL[e.kind]}</td><td class="amt ${e.kind === "added" ? "" : tone(e.amount)}">${e.kind === "added" ? "—" : sgn(e.amount)}</td><td class="amt">${money(e.valueAfter)}</td></tr>`).join("");
  return `<div class="pb"><h2>Ledger</h2><table><thead><tr><th>Date</th>${showHolding ? "<th>Holding</th>" : ""}<th>Entry</th><th class="amt">Amount</th><th class="amt">Value after</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="note">Oldest first. "Value after" is the holding's value once the entry was applied.</div></div>`;
};

const CSS = `
    td { vertical-align: top; }
    tr { page-break-inside: avoid; }
    .desc { font-weight: 600; } .subl { color: #6b6880; font-size: 10px; margin-top: 2px; }
    td.amt { font-weight: 600; white-space: nowrap; } td.nw { white-space: nowrap; color: #6b6880; }
    td.amt.pos { color: #0f9d63; } td.amt.neg { color: #d64550; }
    tr.total td { border-top: 2px solid #e7e5f0; }
    .stack { display: flex; height: 14px; border-radius: 7px; overflow: hidden; gap: 2px; margin: 8px 0; } .stack span { display: block; }
    .legend { display: flex; flex-wrap: wrap; gap: 16px; font-size: 11px; color: #6b6880; }
    .ld { display: inline-flex; align-items: center; gap: 6px; } .dot { width: 9px; height: 9px; border-radius: 3px; display: inline-block; }
    .note { font-size: 10px; color: #6b6880; line-height: 1.5; border-left: 3px solid #e7e5f0; padding-left: 10px; margin-top: 16px; }
    .pb { page-break-before: always; } .hh { margin-top: 4px; font-size: 17px; }`;

const FOOTNOTE = `<div class="note">Growth is the change in value from updates you entered; money you add is not counted as growth. History starts the day each holding was added, and a month with no update carries the last value forward.</div>`;

// Entry point.

const monthOf = (iso: string) => monthKeyOf(new Date(iso), appZone());

export const exportInvestments = async (report: InvestmentReport, opts: InvestmentsExportOptions): Promise<ExportResult> => {
  const holding = opts.holdingId ? report.trend.holdings.find((h) => h.id === opts.holdingId) ?? null : null;
  const series: Series = holding ?? report.trend;
  if (series.points.length === 0) return { shared: false, count: 0 };
  const sliced = slicePeriod(series.points, series.growth, opts.period);
  const bounds = periodBounds(opts.period, series.points.map((p) => p.month));
  if (!sliced || !bounds) return { shared: false, count: 0 };

  const ledger = ledgerInPeriod(
    report.ledger.filter((e) => !opts.holdingId || e.holdingId === opts.holdingId),
    bounds,
    monthOf,
  );
  const stamp = dayStamp(new Date());
  const scopeName = holding ? holding.name.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase() : "portfolio";
  const base = `save-n-spend-investments-${scopeName}-${stamp}`;

  if (opts.format === "csv") {
    if (ledger.length === 0) return { shared: false, count: 0 };
    await deliver("csv", base, ledgerCsv(ledger, (iso) => dayKey(new Date(iso), appZone())));
    return { shared: true, count: ledger.length };
  }

  const has = (k: SectionKey) => opts.sections.includes(k);
  const endsToday = bounds.to === series.points[series.points.length - 1].month;
  const lastPoint = sliced.points[sliced.points.length - 1];
  const front = [
    has("summary") ? summaryCards(report, opts.holdingId, sliced, endsToday) : "",
    has("bestWorst") ? bestWorstCards(sliced) : "",
    !holding && has("allocation") ? allocationHtml(report, lastPoint as PortfolioPoint) : "",
    has("valueChart") && sliced.points.length > 1 ? `<h2>Value over time</h2>${valueSvg(sliced.points)}<div class="legend"><span class="ld"><i class="dot" style="background:${VIOLET}"></i>Value</span><span class="ld"><i class="dot" style="background:${TEAL}"></i>Invested</span></div>` : "",
    has("profitChart") && sliced.points.length > 1 ? `<h2>Profit / loss</h2>${profitSvg(sliced.points, sliced.growth)}` : "",
    holding && has("monthTable") ? `<h2>Month by month</h2>${monthRows(sliced.points, sliced.growth)}${updateLog(holding, bounds)}` : "",
  ].join("");

  const body = [
    front,
    front ? FOOTNOTE : "",
    !holding && has("holdingsTable") ? `<div class="pb">${holdingsTable(report)}</div>` : "",
    !holding && has("holdingPages") ? report.trend.holdings.map((t) => holdingPage(t, opts.period, { value: true, profit: false })).join("") : "",
    has("ledger") && ledger.length > 0 ? ledgerHtml(ledger, !holding) : "",
  ].join("");

  if (!body.trim()) return { shared: false, count: 0 };
  const html = pdfDocument({
    section: "Investments",
    rangeLabel: `${holding ? `${holding.name} · ` : ""}${periodLabel(opts.period, bounds)} · ${formatCalendar(bounds.from, "month")} – ${formatCalendar(bounds.to, "month")}`,
    meta: `As of ${formatInstant(new Date(), "dayYear")} · ${count(holding ? 1 : report.holdings.length, "holding")}`,
    body,
    css: CSS,
  });
  await deliver("pdf", base, html);
  return { shared: true, count: opts.sections.length };
};
