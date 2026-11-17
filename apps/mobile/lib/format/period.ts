import { appZone, calendarFromKey, calendarToday } from "@/lib/zone";
import { MONTHS, type CalendarDay } from "@/lib/format/date";

export type SpanYear = "auto" | "always" | "never";

const toCalendar = (day: CalendarDay): Date => (typeof day === "string" ? calendarFromKey(day) : day);

/**
 * A run of calendar days, inclusive: "16 Nov", "1–7 Sep", "26 Oct – 1 Nov",
 * "29 Dec 2025 – 4 Jan 2026". `year`: `auto` (default) adds it when the span isn't this
 * year, `always` for report headers, `never` where the year is shown elsewhere.
 */
export const formatSpan = (start: CalendarDay, end: CalendarDay, { year = "auto" }: { year?: SpanYear } = {}): string => {
  const a = toCalendar(start);
  const b = toCalendar(end);
  const [ad, am, ay] = [a.getUTCDate(), a.getUTCMonth(), a.getUTCFullYear()];
  const [bd, bm, by] = [b.getUTCDate(), b.getUTCMonth(), b.getUTCFullYear()];

  if (year !== "never" && ay !== by) return `${ad} ${MONTHS[am]} ${ay} – ${bd} ${MONTHS[bm]} ${by}`;

  const tail = year === "always" || (year === "auto" && by !== calendarToday(appZone()).getUTCFullYear()) ? ` ${by}` : "";
  if (ad === bd && am === bm && ay === by) return `${ad} ${MONTHS[am]}${tail}`;
  if (am === bm && ay === by) return `${ad}–${bd} ${MONTHS[bm]}${tail}`;
  return `${ad} ${MONTHS[am]} – ${bd} ${MONTHS[bm]}${tail}`;
};

export type PeriodKey = "day" | "week" | "month" | "year" | "all";

/** The current and previous period by name, sentence case: "This week", "Last month",
 *  "Yesterday". Null for any other offset, where the caller names the dates. */
export const relativePeriod = (key: PeriodKey, offset: number): string | null => {
  if (key === "all") return "All time";
  if (offset === 0) return key === "day" ? "Today" : `This ${key}`;
  if (offset === -1) return key === "day" ? "Yesterday" : `Last ${key}`;
  return null;
};
