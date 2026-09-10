import { useSession } from "@/store/session";

// The client half of "which day is this in". The server buckets every total in the user's
// stored IANA zone (see the API's utils/timezone); this reads the same preference so labels,
// headings and locally computed ranges agree with it.
//
// Two shapes of value appear below and must not be confused:
//
//   • an INSTANT (`Date`) — a real moment, what the API stores and sends.
//   • a CALENDAR DATE (also a `Date`, but only its UTC fields mean anything) — a bare
//     year/month/day, what a heading names and a range is expressed in. `Date.UTC`
//     arithmetic on one of these is exact.
//
// `calendarDate()` is the only crossing between them.

// Matches the API's default, so if `Intl` is unusable both halves are wrong the same way.
const FALLBACK_ZONE = "Asia/Kolkata";

/** The zone the phone itself is set to. */
export const deviceZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_ZONE;
  }
  catch {
    return FALLBACK_ZONE;
  }
};

/**
 * The zone to interpret dates in: the account preference, falling back to the device while the
 * user document is still loading or a legacy account has none. Imperative, for the many pure
 * formatting helpers that can't hold a hook; screens that must re-render on a zone change use
 * `useAppZone()`.
 */
export const appZone = (): string =>
  useSession.getState().user?.prefs?.timeZone || deviceZone();

/** Subscribing form. Without it, changing the zone in Settings leaves every already-mounted
 *  screen printing the old one's days. */
export const useAppZone = (): string => {
  const stored = useSession((s) => s.user?.prefs?.timeZone);
  return stored || deviceZone();
};

/** Whether the account's zone still matches the phone's — drives the Settings hint. */
export const zoneMatchesDevice = (zone: string): boolean => zone === deviceZone();

// One formatter per zone-and-field, cached because building them is what `Intl` spends its
// time on. One field at a time: a multi-field formatter joins them with locale-chosen
// separators in a locale-chosen order, and parsing that back is a guess. A lone field is just
// its digits on every engine — including Hermes, where `formatToParts` is not dependable.
const formatters = new Map<string, Intl.DateTimeFormat>();

type Field = "year" | "month" | "day" | "hour" | "minute" | "second";

const read = (instant: Date, zone: string, field: Field): number => {
  const key = `${zone}|${field}`;
  let formatter = formatters.get(key);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      [field]: "numeric",
      // Without this, an hour formats as "1 PM" and parses as 1 instead of 13.
      ...(field === "hour" ? { hourCycle: "h23" as const } : {}),
    });
    formatters.set(key, formatter);
  }

  // Stripped rather than trusted: a locale may add a marker around a lone field.
  return Number(formatter.format(instant).replace(/\D/g, ""));
};

export type ZonedParts = {
  year: number;
  /** 1–12 — a wall-clock reading, not the 0-based index `Date` uses. */
  month: number;
  day: number;
  hour: number;
  minute: number;
};

/** What a clock in `zone` reads at `instant`. */
export const zonedParts = (instant: Date, zone: string): ZonedParts => ({
  year: read(instant, zone, "year"),
  month: read(instant, zone, "month"),
  day: read(instant, zone, "day"),
  hour: read(instant, zone, "hour"),
  minute: read(instant, zone, "minute"),
});

/**
 * The calendar date an instant falls on in `zone`, as a Date carrying it in its UTC
 * fields. Feed it to `getUTCFullYear()` / `getUTCMonth()` / `getUTCDate()` and to
 * `Date.UTC` arithmetic; its `getTime()` is not a meaningful moment.
 */
export const calendarDate = (instant: Date, zone: string): Date => {
  const { year, month, day } = zonedParts(instant, zone);
  return new Date(Date.UTC(year, month - 1, day));
};

/** Today's calendar date where the user is — the anchor every range hangs off. */
export const calendarToday = (zone: string): Date => calendarDate(new Date(), zone);

/** `YYYY-MM-DD` for the day an instant falls on in `zone`. Orderable and stable. */
export const dayKey = (instant: Date, zone: string): string =>
  calendarDate(instant, zone).toISOString().slice(0, 10);

/** `YYYY-MM` for the month an instant falls on in `zone` — a budget's month key. */
export const monthKeyOf = (instant: Date, zone: string): string =>
  calendarDate(instant, zone).toISOString().slice(0, 7);

// How far ahead of UTC `zone` is at this instant, in ms. Read the wall clock and pretend it
// were UTC: the gap from the real instant IS the offset.
const offsetAt = (instant: Date, zone: string): number => {
  const p = zonedParts(instant, zone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  // Floored to the minute on both sides — the parts have no seconds field.
  return asIfUtc - Math.floor(instant.getTime() / 60_000) * 60_000;
};

/** Whole minutes ahead of UTC — the zone picker's row label ("GMT+5:30"). Read at an instant
 *  rather than stored, since an offset is only true until the next DST change. */
export const zoneOffsetMinutes = (instant: Date, zone: string): number =>
  offsetAt(instant, zone) / 60_000;

/**
 * The instant at which a clock in `zone` reads these calendar fields. Two passes, as in the
 * server's version: the offset must be looked up AT an instant, and the instant is what we are
 * solving for.
 */
export const instantInZone = (
  zone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date => {
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute);
  const firstPass = asIfUtc - offsetAt(new Date(asIfUtc), zone);
  return new Date(asIfUtc - offsetAt(new Date(firstPass), zone));
};

/** Midnight in `zone` on a calendar date, as a real instant — what a picked day must become
 *  before it is stored. UTC midnight makes the 12th the 11th west of Greenwich. */
export const startOfCalendarDay = (calendar: Date, zone: string): Date =>
  instantInZone(
    zone,
    calendar.getUTCFullYear(),
    calendar.getUTCMonth() + 1,
    calendar.getUTCDate(),
  );

/** A `YYYY-MM-DD` or `YYYY-MM` key from the API back into a calendar date. Parsed from its
 *  fields, not `new Date(key)`, which reads it as an instant — the key never named a moment. */
export const calendarFromKey = (key: string): Date => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day ?? 1));
};

/** Whole calendar days from `a` to `b` — positive when `b` is later. */
export const calendarDaysBetween = (a: Date, b: Date): number =>
  Math.round((b.getTime() - a.getTime()) / 86_400_000);
