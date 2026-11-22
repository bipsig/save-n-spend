import type { DashboardSummary, HomePeriod } from "@save-n-spend/types";
import { MONTHS, MONTHS_LONG } from "@/lib/format/date";
import { formatPct, percentOf } from "@/lib/format/pct";

// Home's four tiles under the Month / Year / All time switch: the line under the switch, one
// plain line per tile, and one text size for all four. Signs only, no arrows.

export type Tone = "success" | "danger" | "inkDim" | "info";
export type TileLine = { text: string; tone: Tone } | null;

type Input = Pick<DashboardSummary, "income" | "expenses" | "savings" | "netWorth" | "previous" | "netWorthAtStart">;

type Context = {
  period: HomePeriod;
  /** `YYYY-MM-DD` of the period's first day and of the first record, in the user's zone. */
  startDay: string | null;
  firstDay: string | null;
  /** Formats paise with a sign (the privacy-masked formatter on screen). */
  signedMoney: (paise: number) => string;
  masked: boolean;
};

const dayMonth = (day: string) => `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;

const change = (current: number, previous: number): number | null =>
  previous > 0 ? ((current - previous) / previous) * 100 : null;

const toneOf = (shown: number, goodWhen: "up" | "down"): Tone =>
  shown === 0 ? "inkDim" : (shown > 0) === (goodWhen === "up") ? "success" : "danger";

/** "+24.7% vs Oct", coloured by the figure as shown (one decimal). */
const changeLine = (pct: number | null, vs: string, goodWhen: "up" | "down"): TileLine =>
  pct === null ? null : { text: `${formatPct(pct, { kind: "change" })} vs ${vs}`, tone: toneOf(Math.round(pct * 10) / 10, goodWhen) };

export const homeTiles = (s: Input, { period, startDay, firstDay, signedMoney, masked }: Context) => {
  const prevLabel = !startDay ? "" : period === "month"
    ? MONTHS[(Number(startDay.slice(5, 7)) + 10) % 12]
    : String(Number(startDay.slice(0, 4)) - 1);
  const prev = s.previous ?? null;

  const scope = period === "month" && startDay
    ? `${MONTHS_LONG[Number(startDay.slice(5, 7)) - 1]} ${startDay.slice(0, 4)} so far`
    : period === "year" && startDay
      ? `${startDay.slice(0, 4)} so far${firstDay && firstDay.slice(0, 4) === startDay.slice(0, 4) && firstDay > startDay ? ` · your records start ${dayMonth(firstDay)}` : ""}`
      : firstDay
        ? `Since ${dayMonth(firstDay)} ${firstDay.slice(0, 4)}, your first record`
        : "Everything so far";

  // A period still running reads −100.0% until pay day, so Income says nothing until it has some.
  const income = prev && s.income > 0 ? changeLine(change(s.income, prev.income), prevLabel, "up") : null;
  const expenses = prev ? changeLine(change(s.expenses, prev.expenses), prevLabel, "down") : null;
  const savings: TileLine = s.income > 0
    ? { text: `${formatPct(percentOf(s.savings, s.income))} saved`, tone: "info" }
    : s.expenses > 0 ? { text: "No income yet", tone: "inkDim" } : null;
  const moved = period !== "all" && startDay && typeof s.netWorthAtStart === "number" ? s.netWorth - s.netWorthAtStart : null;
  // A masked amount loses its colour, so the colour can't hint at its size.
  const netWorth: TileLine = moved === null
    ? null
    : { text: `${signedMoney(moved)} since ${dayMonth(startDay!)}`, tone: masked ? "inkDim" : toneOf(moved, "up") };

  return { scope, savingsLabel: period === "all" ? "Saved" : "Savings", income, expenses, savings, netWorth };
};

/** One size for all four tiles: `lg` while every figure fits it (11 characters), else `md`. */
export const tileSize = (figures: string[]): "lg" | "md" => (figures.every((f) => f.length <= 11) ? "lg" : "md");

/** Where a tile's tap opens, carrying the period. Insights has no All time, so it opens on Year. */
export const tileTargets = (period: HomePeriod) => ({
  activityRange: period,
  insightsPeriod: period === "month" ? "month" : "year",
});
