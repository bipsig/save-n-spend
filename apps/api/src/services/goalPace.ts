import { startOfDayInZone } from "../utils/timezone";

// One reading of how a goal is pacing (gaps row 27), shared by Goal watch, the goal_pace
// highlight and the health score's goals pillar, which used to count months three ways.

/** An average calendar month in days. */
const MONTH_DAYS = 365.25 / 12;
const DAY_MS = 86_400_000;

export type GoalPaceInput = { target: number; saved: number; createdAt: Date; deadline?: Date | null };

export type GoalPace = {
    done: boolean;
    /** Under a month old: too soon for its rate to mean anything. */
    young: boolean;
    /** Saved per month so far, counting at least one month. */
    ratePerMonth: number;
    /** Whole months to finish at that rate, or null when nothing has gone in. */
    monthsNeeded: number | null;
    /** Months to the deadline (fractional; negative once passed), or null without one. */
    monthsLeft: number | null;
    /** What it needs per month from now to land on time, counting at least half a month so a
     *  deadline days away asks for a lot rather than infinity. Null without a deadline. */
    requiredPerMonth: number | null;
    /** How far short of the target it ends at the deadline at the current rate; 0 when on
     *  pace, null without a deadline. */
    shortfall: number | null;
};

const daysBetween = (from: Date, to: Date, zone: string): number =>
    Math.round((startOfDayInZone(to, zone).getTime() - startOfDayInZone(from, zone).getTime()) / DAY_MS);

export const goalPace = (goal: GoalPaceInput, now: Date, zone: string): GoalPace => {
    const remaining = Math.max(0, goal.target - goal.saved);
    const daysRunning = daysBetween(goal.createdAt, now, zone);
    const ratePerMonth = goal.saved / Math.max(1, daysRunning / MONTH_DAYS);
    const monthsLeft = goal.deadline ? daysBetween(now, goal.deadline, zone) / MONTH_DAYS : null;
    return {
        done: remaining === 0,
        young: daysRunning < MONTH_DAYS,
        ratePerMonth,
        monthsNeeded: remaining === 0 ? 0 : ratePerMonth > 0 ? Math.ceil(remaining / ratePerMonth) : null,
        monthsLeft,
        requiredPerMonth: monthsLeft === null ? null : remaining / Math.max(0.5, monthsLeft),
        shortfall: monthsLeft === null ? null : Math.max(0, Math.round(remaining - ratePerMonth * Math.max(0, monthsLeft))),
    };
};
