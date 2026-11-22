import type { IGoal } from "@save-n-spend/types";
import { calendarDate, calendarDaysBetween } from "./zone";

/** An average calendar month in days, as the API's services/goalPace counts it. */
const MONTH_DAYS = 365.25 / 12;

export type GoalPace = {
  /** Null when there's no saving rate yet to project from (nothing saved) — not zero,
   *  since zero would read as "any day now". */
  monthsNeeded: number | null;
  projectedDate: string | null; // ISO
};

/**
 * Saved per month since created (at least one month), projected forward to the target: the
 * API's goalPace, which Goal watch, the goal highlight and the health score all read (gaps
 * row 27), run here for every goal. Deadline-agnostic on purpose: "how's it going", not a
 * pass/fail against a date.
 */
export const goalPace = (goal: Pick<IGoal, "target" | "saved" | "createdAt">, now: Date, zone: string): GoalPace => {
  const remaining = goal.target - goal.saved;
  if (remaining <= 0) return { monthsNeeded: 0, projectedDate: null };

  const daysRunning = calendarDaysBetween(calendarDate(new Date(goal.createdAt), zone), calendarDate(now, zone));
  const rate = goal.saved / Math.max(1, daysRunning / MONTH_DAYS);
  if (rate <= 0) return { monthsNeeded: null, projectedDate: null };

  const monthsNeeded = Math.ceil(remaining / rate);
  const projected = new Date(now);
  projected.setUTCMonth(projected.getUTCMonth() + monthsNeeded);
  return { monthsNeeded, projectedDate: projected.toISOString() };
};
