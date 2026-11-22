import { formatCalendar, formatInstant } from "@/lib/format/date";

/** The paper palette every PDF uses (gaps row 121): not the app theme, which is dark. */
export const PDF_COLORS = {
  ink: "#1a1730",
  brand: "#6D5CFF",
  muted: "#6b6880",
  faint: "#9995ad",
  rule: "#e7e5f0",
  ruleSoft: "#f1f0f6",
  track: "#eeecf6",
  zero: "#cfcce0",
  up: "#0f9d63",
  down: "#d64550",
  teal: "#2DD4BF",
  tripRow: "#e9fbf8",
  new: "#b8860b",
  heat1: "#d9d3ff",
  heat2: "#b3a3ff",
  heat3: "#8c73ff",
} as const;


// The frame every exported PDF shares: letterhead, KPI cards, section headings, tables, footer.
// A report supplies its section name, the span it covers, its body, and CSS for whatever is
// its own — so a new report starts from the same look and the three can't drift apart.
// Figures and dates follow the screen rules (lib/format): use formatMoneyExact, never the
// masked formatMoney, since a file the user asked for must not read "₹ ••••".

export const htmlEscape = (value: string): string =>
  value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** One KPI card. `valueHtml` is trusted markup — escape it before passing it in. */
export const kpiCard = (label: string, valueHtml: string, tone: "pos" | "neg" | "" = "", sub = ""): string =>
  `<div class="card"><div class="k">${htmlEscape(label)}</div><div class="v ${tone}">${valueHtml}</div>${sub ? `<div class="sub">${htmlEscape(sub)}</div>` : ""}</div>`;

export const kpiRow = (cards: string[]): string => `<div class="cards">${cards.join("")}</div>`;

const SHELL_CSS = `
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: ${PDF_COLORS.ink}; margin: 0; padding: 32px 28px; }
    .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid ${PDF_COLORS.brand}; padding-bottom: 14px; }
    .brand { font-size: 22px; font-weight: 800; letter-spacing: -0.4px; }
    .brand span { color: ${PDF_COLORS.brand}; }
    .range { font-size: 12px; color: ${PDF_COLORS.muted}; text-transform: uppercase; letter-spacing: 1px; text-align: right; }
    h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1.2px; color: ${PDF_COLORS.muted}; margin: 26px 0 8px; }
    .cards { display: flex; flex-wrap: wrap; gap: 12px; margin: 20px 0 4px; }
    .card { flex: 1 1 22%; border: 1px solid ${PDF_COLORS.rule}; border-radius: 12px; padding: 12px 14px; }
    .card .k { font-size: 10px; color: ${PDF_COLORS.muted}; text-transform: uppercase; letter-spacing: 1px; }
    .card .v { font-size: 17px; font-weight: 800; margin-top: 4px; }
    .card .sub { font-size: 10px; color: ${PDF_COLORS.faint}; margin-top: 3px; }
    .v.pos { color: ${PDF_COLORS.up}; } .v.neg { color: ${PDF_COLORS.down}; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; color: ${PDF_COLORS.muted}; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; padding: 8px; border-bottom: 1px solid ${PDF_COLORS.rule}; }
    td { padding: 8px; border-bottom: 1px solid ${PDF_COLORS.ruleSoft}; }
    th.amt, td.amt { text-align: right; }
    td.amt { font-weight: 700; white-space: nowrap; }
    .amt.pos { color: ${PDF_COLORS.up}; } .amt.neg { color: ${PDF_COLORS.down}; } .amt.out { color: ${PDF_COLORS.ink}; }
    .legend { display: flex; flex-wrap: wrap; gap: 16px; margin: 6px 0 2px; font-size: 11px; color: ${PDF_COLORS.muted}; }
    .ld { display: inline-flex; align-items: center; gap: 6px; }
    .dot { width: 9px; height: 9px; border-radius: 3px; display: inline-block; }
    .foot { margin-top: 24px; font-size: 10px; color: ${PDF_COLORS.faint}; text-align: center; }`;

// One notation for every PDF (gaps row 163). Amounts: `formatMoneyExact` (two decimals, "−").
// Dates: "21 Nov 2026", the year always (a statement outlives the year). Amount cells take one
// class: `pos` money in or a gain, `neg` a loss or a figure below zero, `out` money spent (ink,
// as Activity draws it). Charts: these colours, this width, and the legend CSS above.

/** "21 Nov 2026": a moment, read in the account zone. */
export const pdfDate = (at: string | number | Date): string => formatInstant(at, "dayYear");
/** "21 Nov 2026": a calendar day (`YYYY-MM-DD`), never shifted. */
export const pdfDay = (key: string): string => formatCalendar(key, "dayYear");

/** Chart canvas (viewBox units ≈ points) and colours, shared by the Insights and Investments PDFs. */
export const PDF_CHART = {
  width: 540,
  axis: PDF_COLORS.faint,
  grid: PDF_COLORS.track,
  brand: PDF_COLORS.brand,
} as const;

/** The amount cell's class for a signed figure. */
export const amountTone = (n: number): "pos" | "neg" | "" => (n > 0 ? "pos" : n < 0 ? "neg" : "");

type Doc = {
  /** Named after the brand in the letterhead: "Transactions", "Insights". */
  section: string;
  /** The span covered, top right. */
  rangeLabel: string;
  /** Second line under it: a count, an as-of date. */
  meta?: string;
  body: string;
  /** CSS for this report's own pieces; loaded after the shared rules. */
  css?: string;
};

export const pdfDocument = ({ section, rangeLabel, meta, body, css = "" }: Doc): string =>
  `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>${SHELL_CSS}
    ${css}
  </style></head><body>
    <div class="head">
      <div class="brand">Save n <span>Spend</span> · ${htmlEscape(section)}</div>
      <div class="range">${htmlEscape(rangeLabel)}${meta ? `<br/>${htmlEscape(meta)}` : ""}</div>
    </div>
    ${body}
    <div class="foot">Generated by Save n Spend · ${formatInstant(new Date(), "dayYear")}</div>
  </body></html>`;
