import { addMonthsInZone, addYearsInZone, partsInZone, startOfDayInZone } from "../utils/timezone";
import type { IBill } from "../models/Bill";

// A bill's whole life is described in calendar terms — due on the 12th, monthly, overdue since
// yesterday — so every comparison here is made in the user's zone. In UTC, a bill due on the 1st
// reads as overdue for the first five and a half hours of the day in India.
//
// Shared by the bills screen and the reminder job, which must agree: "due in 2 days" on the list
// and overdue on the lock screen is a bug the user can see from both sides.

type Frequency = "monthly" | "yearly" | undefined;

/** Where a recurring bill's due date lands after this period is settled or skipped. */
export const advanceDueDate = (dueDate: Date, zone: string, frequency: Frequency): Date =>
    frequency === "yearly" ? addYearsInZone(dueDate, zone, 1) : addMonthsInZone(dueDate, zone, 1);

// Zone-local month index, counted from year 0 so two months are comparable with a
// single `>` regardless of the year boundary between them.
const monthOrdinal = (instant: Date, zone: string): number => {
    const { year, month } = partsInZone(instant, zone);
    return year * 12 + (month - 1);
};

export const isSamePeriod = (a: Date, b: Date, zone: string, frequency: Frequency): boolean =>
    frequency === "yearly"
        ? partsInZone(a, zone).year === partsInZone(b, zone).year
        : monthOrdinal(a, zone) === monthOrdinal(b, zone);

export const isFuturePeriod = (dueDate: Date, now: Date, zone: string, frequency: Frequency): boolean =>
    frequency === "yearly"
        ? partsInZone(dueDate, zone).year > partsInZone(now, zone).year
        : monthOrdinal(dueDate, zone) > monthOrdinal(now, zone);

/**
 * Whether this bill has already been settled for the period it is currently due in.
 *
 * A recurring bill is never marked paid — its due date rolls forward instead — so the
 * only evidence that this month's electricity is dealt with is `lastPaidAt` falling in
 * the same period as now.
 */
export const isSettledForPeriod = (
    bill: Pick<IBill, "lastPaidAt" | "frequency">,
    now: Date,
    zone: string,
): boolean => !!bill.lastPaidAt && isSamePeriod(bill.lastPaidAt, now, zone, bill.frequency);

/**
 * Whole zone-local days from today until the bill is due: 0 = today, negative = late.
 *
 * Rounded rather than divided exactly because across a DST change a local day is 23 or
 * 25 hours long, and the truncated version would report "in 6 days" for a week away.
 */
export const daysUntilDue = (dueDate: Date, now: Date, zone: string): number => {
    const today = startOfDayInZone(now, zone).getTime();
    const due = startOfDayInZone(dueDate, zone).getTime();
    return Math.round((due - today) / 86_400_000);
};
