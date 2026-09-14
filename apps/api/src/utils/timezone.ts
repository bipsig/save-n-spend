// Every "which day / week / month does this instant belong to" decision on the server goes
// through this file, and every one takes the user's IANA zone as an argument.
//
// `occurredAt` is an absolute instant, but a budget month and a daily average are statements
// about a WALL CLOCK. Bucket them in UTC and a 1:30am purchase in Delhi lands in yesterday —
// and once a month, in last month, silently moving money between two budgets.
//
// IANA names rather than a stored offset, since an offset is only true until the next DST
// change. Built on `Intl` + `Date.UTC`, so the server's own TZ cannot affect anything here.

/** The zone assumed when a user has none recorded — only documents predating `prefs.timeZone`,
 *  which were all bucketed as IST anyway, so this default reshuffles nobody's history. */
export const DEFAULT_ZONE = "Asia/Kolkata";

export type ZonedParts = {
  year: number;
  /** 1–12, not the 0-based month `Date` uses — this is a wall-clock reading. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 1 = Monday … 7 = Sunday, matching ISO-8601 rather than `getDay()`. */
  weekday: number;
};

// Formatters are the expensive part of `Intl`, not formatting. Unbounded is safe: the key
// space is the zone database.
const formatters = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (zone: string): Intl.DateTimeFormat => {
  const cached = formatters.get(zone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    // Without this, midnight formats as hour 24 in some locales and 0 in others.
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formatters.set(zone, formatter);
  return formatter;
};

/** Whether the runtime's zone database recognises this name. */
export const isValidZone = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  }
  catch {
    return false;
  }
};

/** A zone name safe to hand to `Intl`. Anything unrecognised falls back rather than throwing:
 *  a bad zone on a user document must degrade to slightly-wrong buckets, not a 500. */
export const normalizeZone = (zone?: string | null): string =>
  zone && isValidZone(zone) ? zone : DEFAULT_ZONE;

/** What a clock in `zone` reads at `instant`. */
export const partsInZone = (instant: Date, zone: string): ZonedParts => {
  const parts = formatterFor(zone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  const year = read("year");
  const month = read("month");
  const day = read("day");

  // Derived from the calendar date, not asked of `Intl`, which returns a locale-dependent NAME.
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return {
    year,
    month,
    day,
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
    weekday: dayOfWeek === 0 ? 7 : dayOfWeek,
  };
};

// How far ahead of UTC the zone is at this instant, in ms; positive east of Greenwich. Read
// the wall clock and pretend it were UTC — the gap from the real instant IS the offset.
const offsetAt = (instant: Date, zone: string): number => {
  const parts = partsInZone(instant, zone);
  const asIfUtc = Date.UTC(
    parts.year, parts.month - 1, parts.day,
    parts.hour, parts.minute, parts.second,
  );
  // Floored to the second: the formatter has no finer field, and the milliseconds would
  // otherwise show up as a bogus fraction of the offset.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
};

/**
 * The instant at which a clock in `zone` reads exactly these fields. Two passes, because the
 * offset must be looked up AT an instant and the instant is what we are solving for: the
 * second pass corrects the guess with the offset that applies where it landed, which is what
 * makes the hour after a DST change come out right.
 */
export const instantInZone = (
  zone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date => {
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstPass = asIfUtc - offsetAt(new Date(asIfUtc), zone);
  return new Date(asIfUtc - offsetAt(new Date(firstPass), zone));
};

/** Midnight, in `zone`, of the day containing `instant`. */
export const startOfDayInZone = (instant: Date, zone: string): Date => {
  const { year, month, day } = partsInZone(instant, zone);
  return instantInZone(zone, year, month, day);
};

/** The top of the zone-local hour containing `instant` — the Day period's equivalent of
 *  `startOfDayInZone`, for bucketing a single day by hour instead of a month by day. */
export const startOfHourInZone = (instant: Date, zone: string): Date => {
  const { year, month, day, hour } = partsInZone(instant, zone);
  return instantInZone(zone, year, month, day, hour);
};

/** The last millisecond of the zone-local day containing `instant`. */
export const endOfDayInZone = (instant: Date, zone: string): Date => {
  const { year, month, day } = partsInZone(instant, zone);
  return new Date(instantInZone(zone, year, month, day + 1).getTime() - 1);
};

/** Midnight on the 1st, in `zone`, of the month containing `instant`. */
export const startOfMonthInZone = (instant: Date, zone: string): Date => {
  const { year, month } = partsInZone(instant, zone);
  return instantInZone(zone, year, month, 1);
};

/** Midnight on 1 January, in `zone`, of the year containing `instant`. */
export const startOfYearInZone = (instant: Date, zone: string): Date => {
  const { year } = partsInZone(instant, zone);
  return instantInZone(zone, year, 1, 1);
};

/** Midnight on the Monday of the week containing `instant` — Monday to match insights. */
export const startOfWeekInZone = (instant: Date, zone: string): Date => {
  const { year, month, day, weekday } = partsInZone(instant, zone);
  return instantInZone(zone, year, month, day - (weekday - 1));
};

/** Shift by whole zone-local days. Not `+ n * 86_400_000`: across a DST change a local day is
 *  23 or 25 hours, and a millisecond "7 days later" lands an hour into the wrong day. */
export const addDaysInZone = (instant: Date, zone: string, days: number): Date => {
  const p = partsInZone(instant, zone);
  return instantInZone(zone, p.year, p.month, p.day + days, p.hour, p.minute, p.second);
};

/** Shift by whole hours. An hour has no DST-length ambiguity the way a day does, but this
 *  still routes through `partsInZone`/`instantInZone` rather than raw millisecond arithmetic
 *  — `Date.UTC` normalises an out-of-range hour (e.g. 23 + 3) into the next day correctly,
 *  the same trick `addDaysInZone` above relies on for an out-of-range day. */
export const addHoursInZone = (instant: Date, zone: string, hours: number): Date => {
  const p = partsInZone(instant, zone);
  return instantInZone(zone, p.year, p.month, p.day, p.hour + hours, p.minute, p.second);
};

// Day 0 of the next month is the previous month's last day.
const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * Shift by whole calendar months, clamping the day so the result is always real: 31 January
 * plus one month is 28 February, not 3 March. The rule bills roll on — unclamped, a month-end
 * bill walks forward through the calendar a few days a year.
 */
export const addMonthsInZone = (instant: Date, zone: string, months: number): Date => {
  const p = partsInZone(instant, zone);
  const total = (p.year * 12) + (p.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return instantInZone(
    zone, year, month,
    Math.min(p.day, daysInMonth(year, month)),
    p.hour, p.minute, p.second,
  );
};

/** Shift by whole calendar years, clamping 29 February onto the 28th. */
export const addYearsInZone = (instant: Date, zone: string, years: number): Date =>
  addMonthsInZone(instant, zone, years * 12);

/** `YYYY-MM` — the key a budget is stored under. */
export const monthLabelInZone = (instant: Date, zone: string): string => {
  const { year, month } = partsInZone(instant, zone);
  return `${year}-${String(month).padStart(2, "0")}`;
};

/** `YYYY-MM-DD` in `zone` — a stable key for grouping by day. */
export const dayKeyInZone = (instant: Date, zone: string): string => {
  const { year, month, day } = partsInZone(instant, zone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

/** `YYYY-MM-DDTHH` in `zone` — the Day period's bucket key, one level finer than
 *  `dayKeyInZone`. */
export const hourKeyInZone = (instant: Date, zone: string): string => {
  const { hour } = partsInZone(instant, zone);
  return `${dayKeyInZone(instant, zone)}T${String(hour).padStart(2, "0")}`;
};

/**
 * A `YYYY-MM-DD` key back to the instants bounding that day in `zone`. `end` is the last
 * millisecond, so it pairs with a `$lte`.
 *
 * NOT `new Date("2026-09-01")` plus a zone read: that parses as UTC midnight, which west of
 * Greenwich belongs to the PREVIOUS day. A calendar day is rebuilt from its fields.
 */
export const dayBoundsFromKeyInZone = (
  key: string,
  zone: string,
): { start: Date; end: Date } => {
  const [year, month, day] = key.split("-").map(Number);
  return {
    start: instantInZone(zone, year, month, day),
    end: new Date(instantInZone(zone, year, month, day + 1).getTime() - 1),
  };
};

/** The inverse of `monthLabelInZone`, and the only place a client-supplied month string
 *  becomes a query bound. */
export const monthBoundsInZone = (
  label: string,
  zone: string,
): { start: Date; next: Date } => {
  const [year, month] = label.split("-").map(Number);
  return {
    start: instantInZone(zone, year, month, 1),
    next: instantInZone(zone, year, month + 1, 1),
  };
};
