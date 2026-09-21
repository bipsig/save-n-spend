import {
    addMonthsInZone,
    monthLabelInZone,
    partsInZone,
    startOfDayInZone,
    startOfMonthInZone,
} from "../utils/timezone";
import { monthRange } from "../utils/monthRange";
import type { CategoryTotal, MonthTotals } from "./highlightRules";

// The calendar-and-arithmetic half of building a Snapshot, split out from
// highlightSnapshotService so it can be tested without a database.
//
// Everything here is a pure function of its arguments — a zone, an instant, and rows
// already read. The service keeps the queries; this file decides which months count as
// "behind this one" and where an amount lands once children roll into parents. Pinned by
// highlightSnapshotMath.test.ts.

const MS_PER_DAY = 86_400_000;

/** How many complete months feed the per-category averages, at most. */
export const AVERAGE_MONTHS = 3;

/** Where expenses with no category at all are filed for the rollup. Named to match
 *  the catch-all detection in the rules, so uncategorised spend counts as catch-all. */
export const UNCATEGORISED = { id: "uncategorised", name: "Uncategorised" };

/** Whole zone-local days between two instants, boundaries crossed, DST absorbed. */
export const wholeDays = (from: Date, to: Date, zone: string): number =>
    Math.round((startOfDayInZone(to, zone).getTime() - startOfDayInZone(from, zone).getTime()) / MS_PER_DAY);

/** Zone-local month index from year 0, so two months compare with a single `-`.
 *  Same convention as billService's period arithmetic. */
export const monthOrdinal = (instant: Date, zone: string): number => {
    const { year, month } = partsInZone(instant, zone);
    return year * 12 + (month - 1);
};

/**
 * Consecutive months (as "YYYY-MM" keys) with a contribution, ending at this month — or at
 * last month when this month's hasn't landed yet, so a monthly SIP that fires on the 5th
 * doesn't read as a broken streak on the 1st. The monthly analogue of streakMath's
 * today-or-yesterday anchor.
 */
export const contributionStreak = (months: Set<string>, now: Date, zone: string): number => {
    const monthStart = startOfMonthInZone(now, zone);
    let cursor = months.has(monthLabelInZone(now, zone)) ? monthStart : addMonthsInZone(monthStart, zone, -1);
    let streak = 0;
    while (months.has(monthLabelInZone(cursor, zone))) {
        streak++;
        cursor = addMonthsInZone(cursor, zone, -1);
    }
    return streak;
};

/**
 * Every date-shaped decision a snapshot rests on, made once. `start`/`next` bound the
 * current month; `windowStart` reaches back to cover the comparison months in the same
 * query. `completeLabels` is oldest-first and excludes the current month, which is still
 * being lived in and so is not fair to average against.
 */
export type SnapshotWindow = {
    start: Date;
    next: Date;
    label: string;
    prevLabel: string;
    daysElapsed: number;
    daysInMonth: number;
    completeLabels: string[];
    windowStart: Date;
    monthsAveraged: number;
};

/** `now` is injected so one request can't straddle two ideas of "this month" across a
 *  zone-local midnight. `firstTxnAt` bounds how much history the averages can claim. */
export const snapshotWindow = (zone: string, now: Date, firstTxnAt: Date): SnapshotWindow => {
    const { start, next, label } = monthRange(zone, monthLabelInZone(now, zone));

    // `+ 1` because the 1st is one day elapsed, not zero, or a pace on day one divides by 0.
    const daysElapsed = Math.max(1, wholeDays(start, now, zone) + 1);
    const daysInMonth = wholeDays(start, next, zone);
    const prevLabel = monthLabelInZone(addMonthsInZone(start, zone, -1), zone);

    // The complete months behind this one, oldest first. Stepped through the zone-local
    // month rather than by string arithmetic, so January reaches into the previous year.
    const completeLabels = Array.from({ length: AVERAGE_MONTHS }, (_, i) =>
        monthLabelInZone(addMonthsInZone(start, zone, i - AVERAGE_MONTHS), zone));
    const windowStart = addMonthsInZone(start, zone, -AVERAGE_MONTHS);

    // The divisor is the months there is actually history for — averaging over months the
    // account didn't exist for would read as a collapse in spending. Floored at 1.
    const monthsAveraged = Math.min(
        AVERAGE_MONTHS,
        Math.max(1, monthOrdinal(now, zone) - monthOrdinal(firstTxnAt, zone)),
    );

    return {
        start,
        next,
        label,
        prevLabel,
        daysElapsed,
        daysInMonth,
        completeLabels,
        windowStart,
        monthsAveraged,
    };
};

/** A category as the rollup needs it — ids already stringified by the caller. */
export type CategoryShape = { _id: string; name: string; parent?: string | null };

/** One `$group` row of month totals by type. */
export type FlowRow = { month: string; type: "income" | "expense"; total: number };

/** One `$group` row of expense by month and category. `categoryId` is null for
 *  spend recorded without a category at all. */
export type SpendRow = { month: string; categoryId: string | null; total: number };

/**
 * Maps a category to the slice it is counted under — the same rollup insights' breakdown
 * uses, so a highlight about "Food & Dining" means the slice the chart draws. One level
 * only, matching the data model: categories have a parent or they are one.
 */
export const categoryRoller = (categories: CategoryShape[]) => {
    const parentOf = new Map(categories.map((c) => [String(c._id), c.parent ? String(c.parent) : null]));
    const nameOf = new Map(categories.map((c) => [String(c._id), c.name]));

    /** The key a row's spend accrues to: its parent if it has one, else itself. */
    const rollKey = (categoryId: string | null): string => {
        if (!categoryId) return UNCATEGORISED.id;
        return parentOf.get(categoryId) ?? categoryId;
    };

    // "Uncategorised" rather than the raw id for a category deleted since — a hex string
    // in a sentence meant for a person is worse than admitting the label is gone.
    const rollName = (key: string): string =>
        key === UNCATEGORISED.id ? UNCATEGORISED.name : nameOf.get(key) ?? UNCATEGORISED.name;

    return { rollKey, rollName };
};

export type SnapshotFlows = {
    months: MonthTotals[];
    current: { income: number; expense: number };
    thisMonthByCategory: CategoryTotal[];
    categoryAverages: CategoryTotal[];
};

/**
 * Turns raw month/category rows into the four flow-shaped fields of a Snapshot. Rows for
 * months outside the window are dropped, not counted approximately: a backdated
 * transaction can land in a month that has already closed, and a row belongs to the
 * current month or to one of the complete ones behind it, never to both.
 */
export const rollUpFlows = (
    window: SnapshotWindow,
    roll: ReturnType<typeof categoryRoller>,
    flows: { totals: FlowRow[]; spend: SpendRow[] },
): SnapshotFlows => {
    const { label, completeLabels, monthsAveraged } = window;

    const totalsByMonth = new Map<string, { income: number; expense: number }>();
    for (const row of flows.totals) {
        const entry = totalsByMonth.get(row.month) ?? { income: 0, expense: 0 };
        entry[row.type] += row.total;
        totalsByMonth.set(row.month, entry);
    }

    const months: MonthTotals[] = completeLabels
        // Months before the account existed are absent, not zero — a zero month hands the
        // savings-rate rule a fake collapse. Oldest-first, so trim from the front.
        .slice(AVERAGE_MONTHS - monthsAveraged)
        .map((monthLabel) => ({ label: monthLabel, ...(totalsByMonth.get(monthLabel) ?? { income: 0, expense: 0 }) }));
    const current = totalsByMonth.get(label) ?? { income: 0, expense: 0 };

    const currentByCategory = new Map<string, number>();
    const pastByCategory = new Map<string, number>();
    for (const row of flows.spend) {
        const key = roll.rollKey(row.categoryId);
        if (row.month === label) {
            currentByCategory.set(key, (currentByCategory.get(key) ?? 0) + row.total);
        }
        else if (completeLabels.includes(row.month)) {
            pastByCategory.set(key, (pastByCategory.get(key) ?? 0) + row.total);
        }
    }

    const toTotals = (byKey: Map<string, number>, divisor = 1): CategoryTotal[] =>
        [...byKey].map(([categoryId, total]) => ({
            categoryId,
            name: roll.rollName(categoryId),
            total: Math.round(total / divisor),
        }));

    return {
        months,
        current,
        thisMonthByCategory: toTotals(currentByCategory),
        // Divided by the months there is history for, not by the months in the window.
        categoryAverages: toTotals(pastByCategory, monthsAveraged),
    };
};
