import type { IBudget, ICategory } from "@save-n-spend/types";
import { appZone, calendarToday } from "@/lib/zone";
import { useApiQuery } from "@/lib/query/useApiQuery";
import { MONTHS_LONG } from "@/lib/format/months";

export type BudgetSummary = { budget: IBudget; spent: number };

// Each month is its own key, so stepping months shows the skeleton (or that month's saved
// figures), never the previous month's rows under the new month's heading.
export const useBudgets = (month?: string) => {
  const { data, ...rest } = useApiQuery<BudgetSummary[]>(`/budgets${month ? `?month=${month}` : ""}`, { errorMessage: "Failed to load budgets" });
  // `data` stays null until the first answer, so a screen can tell "loading" from "none".
  return { items: data ?? [], data, ...rest };
};

export const currentMonth = (): string => monthKey(0);

// The `YYYY-MM` key of the month `offset` months from the current one (0 = this
// month, -1 = last), anchored on today in the user's zone — the same month the
// server windows a budget's spend in (see the API's utils/monthRange).
export const monthKey = (offset = 0): string => {
  const today = calendarToday(appZone());
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};


// "2026-07" → "July 2026". Always concrete — inside a form, "This Month" reads
// as a setting you can change rather than the month you're editing.
export const monthTitle = (month: string): string => {
  const [year, index] = month.split("-");
  return `${MONTHS_LONG[Number(index) - 1] ?? month} ${year}`;
};

// A closed month is one that has already ended: its budgets are a record, not a
// plan, so the pacing stats below become retrospective.
export const isMonthClosed = (month: string): boolean => month < currentMonth();

export const budgetTotals = (items: BudgetSummary[], month: string = currentMonth()) => {
  const total = items.reduce((sum, b) => sum + b.budget.limit, 0);
  const spent = items.reduce((sum, b) => sum + b.spent, 0);
  const remaining = total - spent;
  const percentUsed = total > 0 ? Math.round((spent / total) * 1000) / 10 : 0;

  const [year, index] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, index, 0)).getUTCDate();
  const closed = isMonthClosed(month);

  // A live month paces what is left over the days still to come; a closed one has
  // no days left, so the same slots report what the month actually averaged.
  // "Which day of the month is it" is a question about where the user is: in UTC
  // terms an Indian evening is already tomorrow, which would quietly hand the pacing
  // figure one day less than the user actually has.
  const today = calendarToday(appZone());
  const daysLeft = closed ? 0 : Math.max(daysInMonth - today.getUTCDate(), 0);
  // Closed month: every day already happened. Otherwise the day-of-month itself, since
  // "elapsed" and "left" always sum to the whole month.
  const daysElapsed = closed ? daysInMonth : daysInMonth - daysLeft;
  const dailyLimit = daysLeft > 0 ? Math.round(Math.max(remaining, 0) / daysLeft) : 0;
  const dailyAverage = Math.round(spent / daysInMonth);

  const status = percentUsed >= 100 ? "Over budget" : percentUsed >= 80 ? "Warning" : "On track";

  return {
    total, spent, remaining, percentUsed, status,
    closed, daysInMonth, daysLeft, daysElapsed, dailyLimit, dailyAverage,
  };
};

export type BudgetPace = { ratio: number; color: "success" | "warning" | "danger" };

// Pace against how far into the month it actually is, not the raw percent used — on the
// 5th everyone is "under budget", and an unadjusted figure would read every category as
// fine for a fortnight and then collapse. Mirrors the API's healthService `budgetsPillar`
// ratio math (elapsed floored at a week, so day 1 doesn't read as a 30x overrun).
//
// Takes `daysElapsed`/`daysInMonth` from the caller's own `budgetTotals(...)` rather than
// computing its own — that function already gets this right for a CLOSED month (every day
// elapsed, none "today"); recomputing from `calendarToday()` here would silently use
// today's date-of-month even while looking at August from November.
export const budgetPace = (item: BudgetSummary, daysElapsed: number, daysInMonth: number): BudgetPace => {
  const elapsed = Math.max(7, daysElapsed) / daysInMonth;
  const expected = item.budget.limit * elapsed;
  const ratio = expected > 0 ? item.spent / expected : 0;
  const color = ratio > 1.15 ? "danger" : ratio > 0.85 ? "warning" : "success";
  return { ratio, color };
};

export const budgetExcludedCategoryIds = (
  items: BudgetSummary[],
  categories: ICategory[],
): Set<string> => {
  const budgeted = new Set(items.map((b) => b.budget.category));
  const excluded = new Set(budgeted);
  const byId = new Map(categories.map((c) => [c._id, c]));

  for (const category of categories) {
    if (category.parent && budgeted.has(category.parent)) excluded.add(category._id);
  }
  for (const id of budgeted) {
    const parent = byId.get(id)?.parent;
    if (parent) excluded.add(parent);
  }
  return excluded;
};
