import type { BillStatus, BillFrequency } from "@save-n-spend/types";
import {
  appZone,
  calendarDate,
  calendarDaysBetween,
  calendarToday,
  startOfCalendarDay,
} from "@/lib/zone";

// Every label here names a DAY, and a day only exists inside a zone — so they all read the
// account's zone, not the device's (see lib/zone), and "Today" means the day the server
// counted the amount under.
//
// The zone is read imperatively rather than passed in: these are called from row renderers
// and template strings everywhere, and a zone change re-renders the screen anyway.

// An ISO `occurredAt` into a short display string for rows.
export const formatTxnDate = (iso: string): string => {
  const zone = appZone();
  const instant = new Date(iso);
  const time = instant.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: zone });

  // Calendar dates, not `toDateString()`: that reads the DEVICE's day, so a phone left on
  // airport time would disagree with the totals above.
  const day = calendarDate(instant, zone);
  const today = calendarToday(zone);
  const distance = calendarDaysBetween(day, today);

  if (distance === 0) return `Today, ${time}`;
  if (distance === 1) return `Yesterday, ${time}`;
  return instant.toLocaleDateString("en-IN", { month: "short", day: "numeric", timeZone: zone }); // "Jan 25"
};

// "Paid Jan 23" / "Overdue by 2 days" / "Due today" / "Due in 3 days".
export const formatDueLabel = (dueDate: string, status: BillStatus, paidAt?: string | null): string => {
  if (status === "paid") {
    return `Paid ${formatTxnDate(paidAt ?? dueDate)}`;
  }

  const zone = appZone();
  // Whole calendar days — the same count the server calls this bill overdue by.
  const diffDays = calendarDaysBetween(calendarToday(zone), calendarDate(new Date(dueDate), zone));

  if (diffDays < 0) {
    const overdue = Math.abs(diffDays);
    return `Overdue by ${overdue} ${overdue === 1 ? "day" : "days"}`;
  }
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  return `Due in ${diffDays} days`;
};

// Roll a recurring bill's due date forward one cycle — the client's rehearsal of what the
// server does on payment, so the day is clamped the same way: 31 Jan + 1 month is 28 Feb.
export const rollDueDate = (dueDate: string, frequency: BillFrequency): string => {
  const zone = appZone();
  const day = calendarDate(new Date(dueDate), zone);

  const year = day.getUTCFullYear() + (frequency === "yearly" ? 1 : 0);
  const month = day.getUTCMonth() + (frequency === "yearly" ? 0 : 1);
  // Day 0 of the following month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const rolled = new Date(Date.UTC(year, month, Math.min(day.getUTCDate(), lastDay)));
  return startOfCalendarDay(rolled, zone).toISOString();
};

// "Aug 12, 2026" — full due-date display for sheets (spec: "next due rolls to …").
export const formatFullDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: appZone(),
  });

/**
 * A day chosen in a picker → the instant that day starts in the user's zone. The picker
 * hands back a device-local `Date` and only its calendar fields are meant, so they are
 * re-anchored: pinning UTC midnight reads as the previous day west of Greenwich, and a bill
 * due on the 1st would arrive already overdue.
 */
export const toZonedDayISO = (picked: Date): string => {
  const zone = appZone();
  const calendar = new Date(Date.UTC(picked.getFullYear(), picked.getMonth(), picked.getDate()));
  return startOfCalendarDay(calendar, zone).toISOString();
};

// The floor for "today or future" pickers. Device-local on purpose — a picker compares
// against the wheels the user is spinning.
export const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// Day-group header for the Activity list: "TODAY" / "YESTERDAY", else the
// weekday + date ("SAT, 8 AUG", with the year once it's a different one).
export const dayGroupLabel = (iso: string): string => {
  const zone = appZone();
  const instant = new Date(iso);
  const distance = calendarDaysBetween(calendarDate(instant, zone), calendarToday(zone));

  if (distance === 0) return "TODAY";
  if (distance === 1) return "YESTERDAY";

  const sameYear = calendarDate(instant, zone).getUTCFullYear() === calendarToday(zone).getUTCFullYear();
  return instant
    .toLocaleDateString("en-IN", sameYear
      ? { weekday: "short", day: "numeric", month: "short", timeZone: zone }
      : { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: zone })
    .toUpperCase();
};

// Month-break header ("AUGUST 2026") for longer, multi-month Activity lists.
export const monthGroupLabel = (iso: string): string =>
  new Date(iso)
    .toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: appZone() })
    .toUpperCase();
