import {
  appZone,
  calendarDate,
  calendarDaysBetween,
  calendarFromKey,
  calendarToday,
  zonedParts,
} from "@/lib/zone";

// Every date label, from one month table and one clock style, so iOS's `Intl` ("Sept",
// "3:58PM") and the server can't disagree with the app or with each other.
//
// Two entry points, so the zone can't be forgotten:
//   • formatInstant: a moment (when you paid, when a value was updated), read in the account zone.
//   • formatCalendar: a calendar day (a `YYYY-MM-DD` key, a trip's dates), never shifted.

import { MONTHS, MONTHS_LONG, WEEKDAYS } from "./months";

export { MONTHS, MONTHS_LONG, WEEKDAYS };

/**
 * - `day`: "12 Mar", the year added when it isn't this year ("5 Mar 2025")
 * - `dayYear`: "12 Mar 2026", always with the year
 * - `dayLong`: "20 November" (year added when it isn't this year)
 * - `weekday`: "Mon, 16 Nov" (year added when it isn't this year)
 * - `month`: "Sep 2026"; `monthLong`: "September 2026"
 */
export type DayShape = "day" | "dayYear" | "dayLong" | "weekday" | "month" | "monthLong";

/**
 * Instants also take:
 * - `time`: "3:58 pm"
 * - `dayTime`: rows: "Today, 3:58 pm", "Yesterday, 9:12 am", else the `day` shape
 * - `relativeDay`: "today", "yesterday", "tomorrow", else the `day` shape, lower case for the
 *   middle of a sentence (bills: "Paid today")
 *
 * A label that stands on its own ("12m ago", "Yesterday") is `relativeTime` below.
 */
export type InstantShape = DayShape | "time" | "dayTime" | "relativeDay";

export type Instant = string | number | Date;

/** A calendar day: a `YYYY-MM-DD` / `YYYY-MM` key, or a Date carrying it in its UTC fields. */
export type CalendarDay = string | Date;

export const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** "3:58 pm", "12:05 am". Built by hand: the device prints "3:58PM" and "3:58 AM" side by side. */
export const formatClock = (hour: number, minute: number): string =>
  `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`;

/** A picker's device-local Date as a calendar day. Pickers mean the wheels' own fields. */
export const localCalendar = (picked: Date): Date =>
  new Date(Date.UTC(picked.getFullYear(), picked.getMonth(), picked.getDate()));

const toCalendar = (day: CalendarDay): Date => (typeof day === "string" ? calendarFromKey(day) : day);

const shapeDay = (cal: Date, shape: DayShape, zone: string): string => {
  const d = cal.getUTCDate();
  const m = cal.getUTCMonth();
  const y = cal.getUTCFullYear();
  const year = y === calendarToday(zone).getUTCFullYear() ? "" : ` ${y}`;

  switch (shape) {
    case "day": return `${d} ${MONTHS[m]}${year}`;
    case "dayYear": return `${d} ${MONTHS[m]} ${y}`;
    case "dayLong": return `${d} ${MONTHS_LONG[m]}${year}`;
    case "weekday": return `${WEEKDAYS[cal.getUTCDay()]}, ${d} ${MONTHS[m]}${year}`;
    case "month": return `${MONTHS[m]} ${y}`;
    case "monthLong": return `${MONTHS_LONG[m]} ${y}`;
  }
};

export const formatCalendar = (day: CalendarDay, shape: DayShape = "day"): string =>
  shapeDay(toCalendar(day), shape, appZone());

export const formatInstant = (at: Instant, shape: InstantShape = "day", zone = appZone()): string => {
  const instant = at instanceof Date ? at : new Date(at);
  const cal = calendarDate(instant, zone);
  const daysAgo = calendarDaysBetween(cal, calendarToday(zone));
  const time = () => {
    const { hour, minute } = zonedParts(instant, zone);
    return formatClock(hour, minute);
  };

  switch (shape) {
    case "time":
      return time();
    case "dayTime":
      if (daysAgo === 0) return `Today, ${time()}`;
      if (daysAgo === 1) return `Yesterday, ${time()}`;
      return shapeDay(cal, "day", zone);
    case "relativeDay":
      if (daysAgo === 0) return "today";
      if (daysAgo === 1) return "yesterday";
      if (daysAgo === -1) return "tomorrow";
      return shapeDay(cal, "day", zone);
    default:
      return shapeDay(cal, shape, zone);
  }
};

/** "Today", "Yesterday", "3 days ago", from whole days back; past a week, null. */
export const daysAgoLabel = (daysAgo: number): string | null => {
  if (daysAgo <= 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo < 7) return `${daysAgo} days ago`;
  return null;
};

/**
 * How long ago, as a label on its own, in the account zone (gaps row 155):
 * - `time` (feeds, logs): "Just now", "12m ago", "3h ago", "Yesterday", "3 days ago", else "12 Mar"
 * - `day` (since when): "Today", "Yesterday", "3 days ago", else "12 Mar"
 */
export const relativeTime = (at: Instant, { style = "time", zone = appZone() }: { style?: "time" | "day"; zone?: string } = {}): string => {
  const instant = at instanceof Date ? at : new Date(at);
  const cal = calendarDate(instant, zone);
  const daysAgo = calendarDaysBetween(cal, calendarToday(zone));
  if (style === "time" && daysAgo === 0) {
    const minutes = Math.max(0, Math.floor((Date.now() - instant.getTime()) / 60_000));
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  }
  return daysAgoLabel(daysAgo) ?? shapeDay(cal, "day", zone);
};
