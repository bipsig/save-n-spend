import type { InsightsSummary, InsightsPeriod } from "@save-n-spend/types";
import { deliver, htmlEscape, dayStamp } from "@/lib/export";
import { buildTrend, foldCategories, accountShares } from "@/lib/insights";
import { calendarFromKey } from "@/lib/zone";
import { incomeColor, expenseColor } from "@/theme";
// The exact formatter, never the privacy-masked default: an exported file is
// one the user explicitly asked us to generate, so "₹ ••••" in it would be a bug.
import { formatMoneyExact as formatMoney } from "@/lib/money";

// A PDF report of the insights window the user is currently looking at (period +
// however far they've navigated back). We already hold the InsightsSummary in
// the screen, so no refetch — the summary is passed straight in.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The key is a bare calendar date from the server ("2026-08-12"), already cut in the
// user's zone — so it is read as fields, never re-interpreted as a moment.
const seriesLabel = (key: string, period: InsightsPeriod): string => {
  const d = calendarFromKey(key);
  if (period === "year") return `${d.getUTCFullYear()}`;
  if (period === "month") return MONTHS[d.getUTCMonth()];
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
};

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const unitsWord = (period: InsightsPeriod) =>
  period === "year" ? "years" : period === "week" ? "weeks" : "months";

// The shown window's totals sit in the last income-vs-expense unit (the series
// is 6 units ending at the current window).
const currentTotals = (data: InsightsSummary) => {
  const cur = data.incomeVsExpense[data.incomeVsExpense.length - 1] ?? { income: 0, expense: 0 };
  const net = cur.income - cur.expense;
  return { income: cur.income, expense: cur.expense, net, savings: pct(net, cur.income) };
};

// ---- PDF: the graphs, redrawn as vector SVG ---------------------------------

const AXIS = "#9995ad";
const GRID = "#eeecf6";
const BRAND = "#6D5CFF";

// Chart canvas (viewBox units ≈ points). PAD_L reserves room for the y-axis
// amount labels; PAD_B for the x-axis category labels.
const W = 520, H = 150, PAD_L = 48, PAD_B = 22;
const PLOT_W = W - PAD_L;
const PLOT_H = H - PAD_B;

// Compact rupee for axis ticks: ₹8.2k, ₹1.2L, ₹3Cr.
const shortMoney = (paise: number): string => {
  const r = paise / 100;
  const fmt = (n: number, suffix: string) => `₹${n.toFixed(1).replace(/\.0$/, "")}${suffix}`;
  if (r >= 1e7) return fmt(r / 1e7, "Cr");
  if (r >= 1e5) return fmt(r / 1e5, "L");
  if (r >= 1e3) return fmt(r / 1e3, "k");
  return `₹${Math.round(r)}`;
};

// Horizontal gridlines + left-hand amount labels (0 → max), shared by both charts.
const yAxis = (max: number): string =>
  [0, 0.5, 1]
    .map((f) => {
      const y = PLOT_H - f * PLOT_H;
      return `<line x1="${PAD_L}" y1="${y.toFixed(1)}" x2="${W}" y2="${y.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>` +
        `<text x="${PAD_L - 6}" y="${(y + 3).toFixed(1)}" font-size="8" fill="${AXIS}" text-anchor="end">${htmlEscape(shortMoney(max * f))}</text>`;
    })
    .join("");

// Same coordinate math as the on-screen RN charts, emitted as an inline SVG that
// scales to the page width, now with labelled x (time) and y (amount) axes.
const areaSvg = (values: number[], axis: string[]): string => {
  const n = values.length;
  if (n === 0) return "";
  const max = Math.max(...values, 1);
  const x = (i: number) => PAD_L + (n <= 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);
  const y = (v: number) => PLOT_H - (v / max) * PLOT_H;
  const path = values.map((v, i) => `${i ? "L" : "M"} ${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${path} L ${x(n - 1).toFixed(1)},${PLOT_H} L ${x(0).toFixed(1)},${PLOT_H} Z`;
  const ticks = Array.from(new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (n - 1)))));
  const labels = ticks
    .map((i) => {
      const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
      return `<text x="${x(i).toFixed(1)}" y="${H - 5}" font-size="9" fill="${AXIS}" text-anchor="${anchor}">${htmlEscape(axis[i] ?? "")}</text>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${yAxis(max)}
    <path d="${area}" fill="${BRAND}" fill-opacity="0.12"/>
    <path d="${path}" fill="none" stroke="${BRAND}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${labels}</svg>`;
};

const columnsSvg = (pairs: { income: number; expense: number }[], labels: string[]): string => {
  const n = pairs.length || 1;
  const max = Math.max(...pairs.flatMap((p) => [p.income, p.expense]), 1);
  const slotW = PLOT_W / n;
  const barW = Math.min(slotW * 0.24, 16);
  const gap = 5;
  const h = (v: number) => (v / max) * PLOT_H;
  const bars = pairs
    .map((p, i) => {
      const c = PAD_L + slotW * i + slotW / 2;
      const ih = h(p.income), eh = h(p.expense);
      return `<rect x="${(c - barW - gap / 2).toFixed(1)}" y="${(PLOT_H - ih).toFixed(1)}" width="${barW.toFixed(1)}" height="${ih.toFixed(1)}" rx="3" fill="${incomeColor}"/>` +
        `<rect x="${(c + gap / 2).toFixed(1)}" y="${(PLOT_H - eh).toFixed(1)}" width="${barW.toFixed(1)}" height="${eh.toFixed(1)}" rx="3" fill="${expenseColor}"/>`;
    })
    .join("");
  const lbls = labels
    .map((l, i) => `<text x="${(PAD_L + slotW * i + slotW / 2).toFixed(1)}" y="${H - 5}" font-size="9" fill="${AXIS}" text-anchor="middle">${htmlEscape(l)}</text>`)
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${yAxis(max)}
    <line x1="${PAD_L}" y1="${PLOT_H}" x2="${W}" y2="${PLOT_H}" stroke="#e7e5f0" stroke-width="1"/>${bars}${lbls}</svg>`;
};

const legendDot = (color: string, label: string) =>
  `<span class="ld"><span class="dot" style="background:${color}"></span>${htmlEscape(label)}</span>`;

const buildHtml = (data: InsightsSummary, period: InsightsPeriod, label: string): string => {
  const { income, expense, net, savings } = currentTotals(data);
  const cats = foldCategories(data.byCategory);
  const accts = accountShares(data.byAccount);
  const trend = buildTrend(data.trend, period);
  const pairs = data.incomeVsExpense.map((p) => ({ income: p.income, expense: p.expense }));
  const iveLabels = data.incomeVsExpense.map((p) => seriesLabel(p.periodStart, period));

  const kpi = (k: string, v: string, cls = "") => `<div class="card"><div class="k">${k}</div><div class="v ${cls}">${v}</div></div>`;

  const catRows = cats
    .map((c) => `<tr>
      <td class="desc">${htmlEscape(c.name)}</td>
      <td class="barcell"><div class="bar"><span style="width:${Math.max(Math.round(c.pct), 1)}%;background:${c.color}"></span></div></td>
      <td class="amt">${htmlEscape(formatMoney(c.total))}</td>
      <td class="sh">${Math.round(c.pct)}%</td></tr>`)
    .join("");

  const stack = accts.map((a) => `<span style="flex:${Math.max(a.pct, 0.5)};background:${a.color}"></span>`).join("");
  const acctLegend = accts.map((a) => legendDot(a.color, `${a.name} · ${Math.round(a.pct)}%`)).join("");

  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1730; margin: 0; padding: 32px 28px; }
    .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #6D5CFF; padding-bottom: 14px; }
    .brand { font-size: 22px; font-weight: 800; letter-spacing: -0.4px; }
    .brand span { color: #6D5CFF; }
    .range { font-size: 12px; color: #6b6880; text-transform: uppercase; letter-spacing: 1px; text-align: right; }
    h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1.2px; color: #6b6880; margin: 26px 0 8px; }
    .cards { display: flex; flex-wrap: wrap; gap: 12px; margin: 20px 0 4px; }
    .card { flex: 1 1 22%; border: 1px solid #e7e5f0; border-radius: 12px; padding: 12px 14px; }
    .card .k { font-size: 10px; color: #6b6880; text-transform: uppercase; letter-spacing: 1px; }
    .card .v { font-size: 17px; font-weight: 800; margin-top: 4px; }
    .v.pos { color: #0f9d63; } .v.neg { color: #d64550; }
    .legend { display: flex; flex-wrap: wrap; gap: 16px; margin: 6px 0 2px; font-size: 11px; color: #6b6880; }
    .ld { display: inline-flex; align-items: center; gap: 6px; }
    .dot { width: 9px; height: 9px; border-radius: 3px; display: inline-block; }
    .stack { display: flex; height: 16px; border-radius: 8px; overflow: hidden; gap: 2px; margin: 10px 0; }
    .stack span { display: block; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    td { padding: 8px; border-bottom: 1px solid #f1f0f6; vertical-align: middle; }
    .desc { font-weight: 600; }
    td.amt { text-align: right; font-weight: 700; white-space: nowrap; }
    td.barcell { width: 42%; }
    .bar { width: 100%; height: 8px; border-radius: 4px; background: #eeecf6; overflow: hidden; }
    .bar span { display: block; height: 100%; }
    td.sh { text-align: right; color: #6b6880; width: 46px; }
    .foot { margin-top: 24px; font-size: 10px; color: #9995ad; text-align: center; }
  </style></head><body>
    <div class="head">
      <div class="brand">Save n <span>Spend</span> · Insights</div>
      <div class="range">${htmlEscape(label)}<br/>${data.txnCount} transactions</div>
    </div>

    <div class="cards">
      ${kpi("Income", htmlEscape(formatMoney(income)), "pos")}
      ${kpi("Expenses", htmlEscape(formatMoney(expense)), "neg")}
      ${kpi("Net", htmlEscape(formatMoney(net)), net >= 0 ? "pos" : "neg")}
      ${kpi("Savings Rate", `${savings}%`)}
      ${kpi("Avg Daily Spend", htmlEscape(formatMoney(data.avgDailySpendCurrent)))}
      ${kpi("Top Category", htmlEscape(data.topCategory ?? "—"))}
    </div>

    <h2>Spending trend</h2>
    ${areaSvg(trend.values, trend.axis)}

    <h2>Income vs expense · last 6 ${unitsWord(period)}</h2>
    <div class="legend">${legendDot(incomeColor, "Income")}${legendDot(expenseColor, "Expense")}</div>
    ${columnsSvg(pairs, iveLabels)}

    <h2>By category</h2>
    <table><tbody>${catRows}</tbody></table>

    <h2>Where it left from</h2>
    <div class="stack">${stack}</div>
    <div class="legend">${acctLegend}</div>

    <div class="foot">Generated by Save n Spend · ${dayStamp(new Date())}</div>
  </body></html>`;
};

// ---- entry point ------------------------------------------------------------

// Insights export is PDF-only — the value is the graphs, which a spreadsheet
// can't hold.
export const exportInsights = async (
  data: InsightsSummary,
  period: InsightsPeriod,
  label: string,
): Promise<void> => {
  const base = `save-n-spend-insights-${period}-${dayStamp(new Date())}`;
  await deliver("pdf", base, buildHtml(data, period, label));
};
