import type { BillStatus, BillFrequency } from "@save-n-spend/types";
import {
  appZone,
  calendarDate,
  calendarDaysBetween,
  calendarToday,
  startOfCalendarDay,
} from "@/lib/zone";
import { formatInstant } from "@/lib/format/date";

// Every label here names a DAY, and a day only exists inside a zone — so they all read the
// account's zone, not the device's (see lib/zone), and "Today" means the day the server
// counted the amount under.
//
// The zone is read imperatively rather than passed in: these are called from row renderers
// and template strings everywhere, and a zone change re-renders the screen anyway.

// An ISO `occurredAt` into a short display string for rows: "Today, 3:58 pm", "12 Nov",
// "5 Mar 2025".
export const formatTxnDate = (iso: string): string => formatInstant(iso, "dayTime");

// "Paid today" / "Paid 23 Jan" / "Overdue by 2 days" / "Due today" / "Due in 3 days".
// A paid bill gets a date, never a time.
export const formatDueLabel = (dueDate: string, status: BillStatus, paidAt?: string | null): string => {
  if (status === "paid") {
    return `Paid ${formatInstant(paidAt ?? dueDate, "relativeDay")}`;
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

// "12 Aug 2026" — full due-date display for sheets (spec: "next due rolls to …").
export const formatFullDate = (iso: string): string => formatInstant(iso, "dayYear");

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
  const distance = calendarDaysBetween(calendarDate(new Date(iso), zone), calendarToday(zone));
  if (distance === 0) return "TODAY";
  if (distance === 1) return "YESTERDAY";
  return formatInstant(iso, "weekday", zone).toUpperCase();
};

// Month-break header ("AUGUST 2026") for longer, multi-month Activity lists.
export const monthGroupLabel = (iso: string): string => formatInstant(iso, "monthLong").toUpperCase();
