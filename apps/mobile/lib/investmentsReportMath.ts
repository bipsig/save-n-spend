import type { GrowthPoint, LedgerEntry, MonthPoint } from "@save-n-spend/types";

// The choices behind the Investments export sheet, kept free of UI so they can be tested.

export type Scope = "all" | "holding";

export type SectionKey =
  | "summary" | "allocation" | "valueChart" | "profitChart" | "bestWorst"
  | "holdingsTable" | "holdingPages" | "monthTable" | "ledger";

export const SECTIONS: Record<Scope, { group: string; items: { key: SectionKey; label: string; sub: string }[] }[]> = {
  all: [
    { group: "Portfolio", items: [
      { key: "summary", label: "Summary figures", sub: "Value, invested, profit, per year" },
      { key: "allocation", label: "Allocation", sub: "Split by kind" },
      { key: "valueChart", label: "Value chart", sub: "Value over invested, by month" },
      { key: "profitChart", label: "Profit / loss chart", sub: "Profit line and monthly change" },
      { key: "bestWorst", label: "Best & worst months", sub: "Stat tiles under the charts" },
    ] },
    { group: "Holdings", items: [
      { key: "holdingsTable", label: "Holdings table", sub: "One row each, with totals" },
      { key: "holdingPages", label: "A page per holding", sub: "Chart, month-by-month, update log" },
    ] },
    { group: "Records", items: [
      { key: "ledger", label: "Ledger", sub: "Every contribution, redemption and update" },
    ] },
  ],
  holding: [
    { group: "This holding", items: [
      { key: "summary", label: "Summary figures", sub: "Value, invested, profit, per year" },
      { key: "valueChart", label: "Value chart", sub: "Value over invested, by month" },
      { key: "profitChart", label: "Profit / loss chart", sub: "Profit line and monthly change" },
      { key: "bestWorst", label: "Best & worst months", sub: "Stat tiles under the charts" },
      { key: "monthTable", label: "Month-by-month table", sub: "Added, growth, invested, value" },
    ] },
    { group: "Records", items: [
      { key: "ledger", label: "Ledger and value updates", sub: "Every entry on this holding" },
    ] },
  ],
};

export const sectionKeys = (scope: Scope): SectionKey[] => SECTIONS[scope].flatMap((g) => g.items.map((i) => i.key));

export type PresetKey = "full" | "summary" | "ledger";
export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "full", label: "Full statement" },
  { key: "summary", label: "Summary" },
  { key: "ledger", label: "Ledger" },
];

const SUMMARY_SET: SectionKey[] = ["summary", "allocation", "valueChart", "profitChart", "bestWorst"];

export const presetSections = (preset: PresetKey, scope: Scope): SectionKey[] => {
  const all = sectionKeys(scope);
  if (preset === "full") return all;
  if (preset === "ledger") return ["ledger"];
  return all.filter((k) => SUMMARY_SET.includes(k));
};

/** The preset the current selection equals, or null — which is what "Custom" means. */
export const matchPreset = (selected: SectionKey[], scope: Scope): PresetKey | null => {
  const same = (a: SectionKey[], b: SectionKey[]) => a.length === b.length && a.every((k) => b.includes(k));
  return PRESETS.find((p) => same(selected, presetSections(p.key, scope)))?.key ?? null;
};

/** A rough page count for the footer — close enough that a 20-page file is never a surprise. */
export const estimatePages = (selected: SectionKey[], holdings: number, ledgerRows: number): number => {
  const has = (k: SectionKey) => selected.includes(k);
  const front = SUMMARY_SET.some(has) || has("monthTable") ? 1 : 0;
  const table = has("holdingsTable") ? 1 : 0;
  const per = has("holdingPages") ? holdings : 0;
  const ledger = has("ledger") ? Math.max(1, Math.ceil(ledgerRows / 28)) : 0;
  return Math.max(1, front + table + per + ledger);
};

// Periods.

export type Period = { kind: "6m" } | { kind: "1y" } | { kind: "all" } | { kind: "fy"; start: number };

/** Financial year `start` runs April of `start` to March of `start + 1`. */
export const fyRange = (start: number): { from: string; to: string } => ({ from: `${start}-04`, to: `${start + 1}-03` });

export const fyLabel = (start: number): string => `FY ${start}–${String((start + 1) % 100).padStart(2, "0")}`;

/** The financial year a `YYYY-MM` falls in. */
export const fyOf = (month: string): number => {
  const y = Number(month.slice(0, 4));
  return Number(month.slice(5, 7)) >= 4 ? y : y - 1;
};

/** Every financial year from the first month of history to the current one, newest first. */
export const availableFys = (firstMonth: string, currentMonth: string): number[] => {
  const out: number[] = [];
  for (let y = fyOf(currentMonth); y >= fyOf(firstMonth); y--) out.push(y);
  return out;
};

/** The months a period covers, as an inclusive `YYYY-MM` range clipped to the history. */
export const periodBounds = (period: Period, months: string[]): { from: string; to: string } | null => {
  if (months.length === 0) return null;
  const first = months[0], last = months[months.length - 1];
  if (period.kind === "all") return { from: first, to: last };
  if (period.kind === "6m") return { from: months[Math.max(0, months.length - 6)], to: last };
  if (period.kind === "1y") return { from: months[Math.max(0, months.length - 12)], to: last };
  const fy = fyRange(period.start);
  const from = fy.from > first ? fy.from : first;
  const to = fy.to < last ? fy.to : last;
  return from > to ? null : { from, to };
};

/** The points (and their growth) inside a period, or null when there is nothing in it. */
export const slicePeriod = <P extends MonthPoint, G extends GrowthPoint>(
  points: P[],
  growth: G[],
  period: Period,
): { points: P[]; growth: G[] } | null => {
  const b = periodBounds(period, points.map((p) => p.month));
  if (!b) return null;
  const keep = points.map((p) => p.month >= b.from && p.month <= b.to);
  return { points: points.filter((_, i) => keep[i]), growth: growth.filter((_, i) => keep[i]) };
};

export const ledgerInPeriod = (ledger: LedgerEntry[], months: { from: string; to: string }, monthOf: (iso: string) => string): LedgerEntry[] =>
  ledger.filter((e) => {
    const m = monthOf(e.at);
    return m >= months.from && m <= months.to;
  });

export const periodLabel = (period: Period, bounds: { from: string; to: string } | null): string => {
  if (period.kind === "fy") return fyLabel(period.start);
  if (!bounds) return "";
  if (period.kind === "all") return "All time";
  return period.kind === "6m" ? "Last 6 months" : "Last 12 months";
};

// Ledger CSV.

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const KIND_LABEL: Record<LedgerEntry["kind"], string> = { added: "Added", in: "Money in", out: "Money out", update: "Value update" };

export const ledgerCsv = (entries: LedgerEntry[], dateOf: (iso: string) => string): string => {
  const rows = entries.map((e) => [
    dateOf(e.at), e.holdingName, KIND_LABEL[e.kind], (e.amount / 100).toFixed(2), (e.valueAfter / 100).toFixed(2),
  ].map(csvCell).join(","));
  return "﻿" + [["Date", "Holding", "Entry", "Amount (INR)", "Value after (INR)"].join(","), ...rows].join("\r\n");
};

/** Best and worst month by growth, among months that had a value update. */
export const bestWorst = (growth: GrowthPoint[]): { best: GrowthPoint | null; worst: GrowthPoint | null } => {
  const real = growth.filter((g) => g.upd && !g.opening && g.growth !== null);
  const pick = (better: (a: number, b: number) => boolean) =>
    real.reduce<GrowthPoint | null>((a, g) => (a === null || better(g.growth as number, a.growth as number) ? g : a), null);
  return { best: pick((x, y) => x > y), worst: pick((x, y) => x < y) };
};
