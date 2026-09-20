import type { IBill } from "@save-n-spend/types";
import { budgetTotals, type BudgetSummary } from "./budgets";
import { owedThroughMonth } from "./bills";
import { appZone, calendarToday } from "./zone";

export type SafeToSpendForecast = {
  /** One entry per day from today (inclusive) through month-end — the running
   *  discretionary balance at the current pace. Unpaid bills are NOT re-subtracted per
   *  day here: `safeToSpend` already carves out every bill still owed this month
   *  up front (see lib/bills's owedThroughMonth), so this only projects the erosion
   *  from ongoing daily spending against what's already bill-adjusted. */
  series: number[];
  /** ISO date of the first day the series would cross zero, or null if it never does
   *  before month-end at the current pace. */
  goesNegativeOn: string | null;
  /** Spent so far this month ÷ days elapsed — today's actual pace, not the whole-month
   *  average `budgetTotals.dailyAverage` gives (that one divides by the full month,
   *  understating the true rate early on). */
  dailyBurnRate: number;
};

/** Below this many elapsed days, one or two outlier purchases can swing the rate wildly
 *  — the same kind of floor budget_pace's own minimum-days gate applies. */
export const MIN_FORECAST_DAYS = 3;

// Pure client computation, like Safe to Spend itself — the budgets/bills it reads are
// already fetched on the dashboard, so this needs no new network call.
export const projectSafeToSpend = (
  budgetItems: BudgetSummary[],
  bills: IBill[],
  month: string,
): SafeToSpendForecast | null => {
  const totals = budgetTotals(budgetItems, month);

  // A closed month has no days left to project into; too few elapsed days makes the
  // rate too noisy to be honest about — both are "no forecast", not a fake-precise one.
  if (totals.closed || totals.daysElapsed < MIN_FORECAST_DAYS) return null;

  const safeToSpendNow = totals.remaining - owedThroughMonth(bills, month);
  const dailyBurnRate = Math.round(totals.spent / totals.daysElapsed);

  const today = calendarToday(appZone());
  const series: number[] = [];
  let goesNegativeOn: string | null = null;

  for (let d = 0; d <= totals.daysLeft; d++) {
    const balance = safeToSpendNow - dailyBurnRate * d;
    series.push(balance);
    if (goesNegativeOn === null && balance < 0) {
      goesNegativeOn = new Date(Date.UTC(
        today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + d,
      )).toISOString();
    }
  }

  return { series, goesNegativeOn, dailyBurnRate };
};
