// The pure, calendar-and-arithmetic half of building a review — split out from
// reviewTimelineService so it can be tested without a database, same convention as
// highlightSnapshotMath.ts.

/** Days in the period with nothing logged. A closed period is always complete, so unlike
 *  the dashboard's own no-spend-days (which floors at day 5 of a still-running month)
 *  there's no "too early to tell" case here — the period already ended. */
export const noSpendDays = (totalDays: number, activeDays: number): number =>
    Math.max(0, totalDays - activeDays);

export type WeekStandout = {
    /** The bucket key (from `getTrend`) the standout week starts on. */
    startDate: string;
    total: number;
    kind: "low" | "high";
};

/** A week is called out only when it's meaningfully off the period's own average — not
 *  every month has one, and forcing a callout on a flat month would be a fake claim. */
const LOW_RATIO = 0.6;
const HIGH_RATIO = 1.4;

/**
 * The most notable full 7-day window inside a month's daily expense buckets, compared
 * only against THIS period's own average — never against other months, which would need
 * history this function doesn't have. A trailing partial week (a 31-day month has 4 full
 * weeks and 3 leftover days) is dropped rather than padded.
 */
export const bestWorstWeek = (daily: { date: string; amount: number }[]): WeekStandout | null => {
    const fullWeeks = Math.floor(daily.length / 7);
    if (fullWeeks < 2) return null; // nothing to compare a single week against

    const windows: { startDate: string; total: number }[] = [];
    for (let w = 0; w < fullWeeks; w++) {
        const slice = daily.slice(w * 7, w * 7 + 7);
        windows.push({ startDate: slice[0].date, total: slice.reduce((sum, d) => sum + d.amount, 0) });
    }

    const average = windows.reduce((sum, w) => sum + w.total, 0) / windows.length;
    if (average <= 0) return null;

    const lowest = windows.reduce((a, b) => (b.total < a.total ? b : a));
    const highest = windows.reduce((a, b) => (b.total > a.total ? b : a));

    const lowDeviation = 1 - lowest.total / average;
    const highDeviation = highest.total / average - 1;

    if (lowest.total <= average * LOW_RATIO && lowDeviation >= highDeviation) {
        return { startDate: lowest.startDate, total: lowest.total, kind: "low" };
    }
    if (highest.total >= average * HIGH_RATIO) {
        return { startDate: highest.startDate, total: highest.total, kind: "high" };
    }
    return null;
};
