// Every "which day / week / month / year does this instant belong to" decision on
// the server goes through this file, and every one of them takes the user's IANA
// zone as an argument.
//
// Why a zone at all: `occurredAt` is an absolute instant, but a budget month, an
// overdue bill, and a daily average are all statements about a WALL CLOCK. Bucket
// them in UTC and a 1:30am purchase in Delhi lands in yesterday — and, once a
// month, in last month, which silently moves money between two budgets. The app
// used to do exactly that, in five different places.
//
// Why IANA names rather than a stored numeric offset: an offset is only true until
// the next DST change, and a reminder job that has to fire at 9am local needs to
// know which offset applies on the day it runs, not on the day the user signed up.
//
// Implemented on `Intl` + `Date.UTC` rather than a dependency: both are exact,
// both consult the zone database instead of the process's own TZ, and neither can
// be broken by the server being deployed somewhere that isn't UTC.

/**
 * The zone assumed when a user has never had one recorded — which is only the
 * documents written before `prefs.timeZone` existed. The app's audience is Indian
 * and this is the zone every one of those documents was bucketed as anyway (IST
 * has no DST, so UTC+5:30 is the whole story), which makes it the one default that
 * doesn't retroactively reshuffle anybody's history.
 */
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

// Formatters are the expensive part of `Intl`, not formatting — and a request that
// buckets six units re-reads the same zone six times. Keyed by zone, unbounded on
// purpose: the key space is the zone database, so it cannot grow without bound.
const formatters = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (zone: string): Intl.DateTimeFormat => {
  const cached = formatters.get(zone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    // Without this, midnight formats as hour 24 in some locales and 0 in others,
    // and the arithmetic below would be a day out once a day.
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
    // RangeError — the only way `Intl` rejects a zone.
    return false;
  }
};

/**
 * A zone name that is safe to hand to `Intl`. Anything missing or unrecognised
 * falls back rather than throwing: a bad zone on a user document must degrade to
 * slightly-wrong buckets, never to a 500 on every screen the user opens.
 */
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

  // Derived from the calendar date rather than asked of `Intl`: a weekday NAME
  // would have to be mapped back through a locale, while the day-of-week of a
  // given Y-M-D is the same everywhere.
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

// How far ahead of UTC the zone is at this instant, in ms. Positive east of
// Greenwich. Derived by reading the wall clock and pretending it were UTC — the
// gap between that and the real instant IS the offset.
const offsetAt = (instant: Date, zone: string): number => {
  const parts = partsInZone(instant, zone);
  const asIfUtc = Date.UTC(
    parts.year, parts.month - 1, parts.day,
    parts.hour, parts.minute, parts.second,
  );
  // Floored to the second because the formatter has no finer field, so the
  // milliseconds would otherwise show up as a bogus fraction of the offset.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
};

/**
 * The instant at which a clock in `zone` reads exactly these fields.
 *
 * Two passes, and that isn't paranoia: the offset has to be looked up AT an
 * instant, but the instant is what we're solving for. The first pass guesses with
 * the offset that applies to the same wall clock read as UTC, the second corrects
 * it using the offset that actually applies where the guess landed. That second
 * pass is what makes the hour after a DST change come out right.
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

/**
 * Midnight on the Monday of the week containing `instant`, in `zone`. Monday
 * because that is what the insights week has always been, and what MongoDB's
 * `$dateTrunc` is told below.
 */
export const startOfWeekInZone = (instant: Date, zone: string): Date => {
  const { year, month, day, weekday } = partsInZone(instant, zone);
  return instantInZone(zone, year, month, day - (weekday - 1));
};

/**
 * Shift by whole zone-local days. Not `+ n * 86_400_000`: across a DST change a
 * local day is 23 or 25 hours long, and a "7 days later" computed in milliseconds
 * would land an hour into the wrong day.
 */
export const addDaysInZone = (instant: Date, zone: string, days: number): Date => {
  const p = partsInZone(instant, zone);
  return instantInZone(zone, p.year, p.month, p.day + days, p.hour, p.minute, p.second);
};

// Last day of a zone-agnostic calendar month — day 0 of the next month is the
// previous month's last day, the standard `Date` trick.
const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * Shift by whole calendar months, clamping the day so the result is always real:
 * 31 January plus one month is 28 February, not 3 March. This is the rule bills
 * roll on, and the un-clamped version would walk a month-end bill forward through
 * the calendar a few days a year.
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

/**
 * A `YYYY-MM-DD` key back to the instants that bound that day in `zone`. `end` is
 * the last millisecond, so it pairs with a `$lte`.
 *
 * Deliberately NOT `new Date("2026-09-01")` followed by a zone read: that string
 * parses as UTC midnight, which in any zone west of Greenwich belongs to the
 * PREVIOUS day — so the range would start and end a day early for half the world.
 * A calendar day has to be rebuilt from its fields, never from an instant.
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

/**
 * A `YYYY-MM` label back to the pair of instants that bound it in `zone`. The
 * inverse of `monthLabelInZone`, and the only place a client-supplied month string
 * becomes a query bound.
 */
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
