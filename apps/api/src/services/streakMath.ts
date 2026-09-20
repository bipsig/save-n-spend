import { addDaysInZone, dayKeyInZone } from "../utils/timezone";

// The pure half of the logging streak — no I/O, no clock read of its own, mirrors
// highlightSnapshotMath.ts's own split. The caller (highlightSnapshotService.ts) does
// the one aggregation this needs and hands over a plain set of day keys; everything here
// is calendar arithmetic over that set, pinned by streakMath.test.ts.

/** How far back the day-key aggregation looks. Bounded, not "since the account began" —
 *  a year-plus streak is already remarkable, and an unbounded scan costs more the longer
 *  someone's history gets for a number nobody needs past a year anyway. */
export const STREAK_LOOKBACK_DAYS = 400;

/**
 * Consecutive zone-local days ending at (or just before) `now`, walking backward through
 * `loggedDays`. Today is exempt from breaking the streak while it's still in progress —
 * a day that hasn't ended yet can't have skipped it — so the walk anchors on today if
 * it's already logged, otherwise on yesterday.
 */
export const currentStreak = (loggedDays: Set<string>, now: Date, zone: string): number => {
    const today = dayKeyInZone(now, zone);
    const anchor = loggedDays.has(today) ? now : addDaysInZone(now, zone, -1);
    if (!loggedDays.has(dayKeyInZone(anchor, zone))) return 0;

    let streak = 0;
    let cursor = anchor;
    while (loggedDays.has(dayKeyInZone(cursor, zone))) {
        streak++;
        cursor = addDaysInZone(cursor, zone, -1);
    }
    return streak;
};
