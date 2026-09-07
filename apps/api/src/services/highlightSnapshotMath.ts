import {
    addMonthsInZone,
    monthLabelInZone,
    partsInZone,
    startOfDayInZone,
} from "../utils/timezone";
import { monthRange } from "../utils/monthRange";
import type { CategoryTotal, MonthTotals } from "./highlightRules";

// The calendar-and-arithmetic half of building a Snapshot, split out from
// highlightSnapshotService so it can be tested without a database.
//
// Everything here is a pure function of its arguments — a zone, an instant, and rows
// that have already been read. The service keeps the queries; this file keeps the two
// things that were actually going wrong unobserved: which months count as "behind
// this one", and where a transaction's amount lands once children roll into parents.
//
// The seam is drawn at rows-in, facts-out rather than at the Mongo boundary because
// the aggregation's shape is the easy part to get right and the calendar is not. A
// month label crossing a year, a divisor over months the account didn't exist for, a
// backdated transaction landing in a month that has already closed: all of those are
// decided below, on plain values, and are now pinned by highlightSnapshotMath.test.ts.

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
 * Every date-shaped decision a snapshot rests on, made once.
 *
 * `start`/`next` bound the current month; `windowStart` reaches back far enough to
 * cover the comparison months in the same query. `completeLabels` is oldest-first and
 * excludes the current month, because a month still being lived in is not a fair
 * thing to average against. `monthsAveraged` is the honest divisor — see below.
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

/**
 * `now` is injected rather than read, so a request served just past a zone-local
 * midnight is never split across two ideas of "this month" — and so a test can state
 * the date it means. `firstTxnAt` bounds how much history the averages can claim.
 */
export const snapshotWindow = (zone: string, now: Date, firstTxnAt: Date): SnapshotWindow => {
    const { start, next, label } = monthRange(zone, monthLabelInZone(now, zone));

    // `+ 1` because the 1st is one day elapsed, not zero — a pace computed on day one
    // would otherwise divide by nothing. Floored at 1 for the same reason.
    const daysElapsed = Math.max(1, wholeDays(start, now, zone) + 1);
    const daysInMonth = wholeDays(start, next, zone);
    const prevLabel = monthLabelInZone(addMonthsInZone(start, zone, -1), zone);

    // The complete months behind this one, oldest first — the comparison base. Built
    // by stepping the zone-local month rather than by string arithmetic, so January
    // reaches back into the previous year without a special case.
    const completeLabels = Array.from({ length: AVERAGE_MONTHS }, (_, i) =>
        monthLabelInZone(addMonthsInZone(start, zone, i - AVERAGE_MONTHS), zone));
    const windowStart = addMonthsInZone(start, zone, -AVERAGE_MONTHS);

    // An average over months the account didn't exist for would read as a collapse in
    // spending, so the divisor is the months there is actually history for. Floored at
    // 1: a brand-new account divides by one month, never by zero.
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

/** A category as the rollup needs it — ids already stringified by the caller, so
 *  nothing here has to know about ObjectIds. */
export type CategoryShape = { _id: string; name: string; parent?: string | null };

/** One `$group` row of month totals by type. */
export type FlowRow = { month: string; type: "income" | "expense"; total: number };

/** One `$group` row of expense by month and category. `categoryId` is null for
 *  spend recorded without a category at all. */
export type SpendRow = { month: string; categoryId: string | null; total: number };

/**
 * Maps a category to the slice it should be counted under.
 *
 * The same rollup insights' breakdown uses, so a highlight about "Food & Dining"
 * means the same slice the chart draws. Only one level is collapsed, matching the
 * data model: categories have a parent or they are one.
 */
export const categoryRoller = (categories: CategoryShape[]) => {
    const parentOf = new Map(categories.map((c) => [String(c._id), c.parent ? String(c.parent) : null]));
    const nameOf = new Map(categories.map((c) => [String(c._id), c.name]));

    /** The key a row's spend accrues to: its parent if it has one, else itself. */
    const rollKey = (categoryId: string | null): string => {
        if (!categoryId) return UNCATEGORISED.id;
        return parentOf.get(categoryId) ?? categoryId;
    };

    // Falls back to "Uncategorised" rather than the raw id for a category that has
    // been deleted since the transaction was recorded. A hex string in a sentence
    // meant for a person is worse than admitting the label is gone.
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
 * Turns raw month/category rows into the four flow-shaped fields of a Snapshot.
 *
 * Rows for months outside the window are dropped rather than counted somewhere
 * approximate: the aggregation bounds `occurredAt`, but a backdated transaction can
 * legitimately land in a month that has already closed, and a row belongs either to
 * the month being lived in or to one of the complete months behind it — never to both.
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
        // Months before the account existed are absent, not zero — a zero month would
        // hand the savings-rate rule a fake collapse to announce. `completeLabels` is
        // oldest-first, so trimming from the front drops exactly those.
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
