import { useSession } from "@/store/session";

// The client half of the app's one answer to "which day is this in".
//
// The server buckets every total in the user's stored IANA zone (see the API's
// utils/timezone). This file is how the client agrees with it: the same zone, read
// from the same preference, used for every label, group heading, and date range the
// app computes locally.
//
// Before this, the two halves disagreed by design — rows were grouped by the
// DEVICE's day while the dashboard, budgets, and insights were windowed in UTC. A
// purchase at 1am in Delhi therefore appeared under "Today" and counted towards
// yesterday, and on the 1st of a month, towards the previous month's budget.
//
// Two shapes of value appear below, and keeping them apart is what makes the rest
// of the app simple:
//
//   • an INSTANT (`Date`) — a real moment, what the API stores and sends.
//   • a CALENDAR DATE (also a `Date`, but only its UTC fields mean anything) — a
//     bare year/month/day with no time and no zone, the thing a heading names and a
//     range is expressed in. `Date.UTC` arithmetic on one of these is exact, which
//     is why every range helper in the app can keep using it.
//
// `calendarDate()` is the crossing between them, and the only place a zone is
// consulted for that purpose.

// Only reached if the runtime can't tell us its own zone, which would mean `Intl`
// is unusable and every helper here is already degraded. Matching the API's default
// keeps the two halves wrong in the same direction rather than in different ones.
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
 * The zone to interpret dates in: the account preference, falling back to the
 * device while the user document is still loading or a legacy account has none.
 *
 * Imperative, for the many pure formatting helpers that can't hold a hook. Screens
 * that must re-render when the zone changes use `useAppZone()` instead.
 */
export const appZone = (): string =>
  useSession.getState().user?.prefs?.timeZone || deviceZone();

/**
 * Subscribing form. Needed by any screen that shows a date label or computes a
 * range — without it, changing the zone in Settings would leave every already-
 * mounted screen printing the old one's days.
 */
export const useAppZone = (): string => {
  const stored = useSession((s) => s.user?.prefs?.timeZone);
  return stored || deviceZone();
};

/** Whether the account's zone still matches the phone's — drives the Settings hint. */
export const zoneMatchesDevice = (zone: string): boolean => zone === deviceZone();

// One formatter per zone-and-field. Formatters are what `Intl` spends its time
// building, and the activity list asks for three fields per row.
//
// Asking for ONE field at a time is deliberate: a formatter given several fields
// returns them joined by whatever separators its locale prefers, in whatever order,
// and parsing that back is a guess. A single field is just its digits, in every
// locale, on every engine — including Hermes, whose `formatToParts` the server-side
// version of this code relies on but which is not dependable on a phone.
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

  // Stripped rather than trusted: a locale is free to add a marker around a lone
  // field, and only the digits are ever meaningful here.
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

// How far ahead of UTC `zone` is at this instant, in ms. Derived by reading the wall
// clock and pretending it were UTC: the gap between that and the real instant IS the
// offset.
const offsetAt = (instant: Date, zone: string): number => {
  const p = zonedParts(instant, zone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  // Both sides floored to the minute — the parts have no seconds field, and every
  // real zone offset is a whole number of minutes anyway.
  return asIfUtc - Math.floor(instant.getTime() / 60_000) * 60_000;
};

/**
 * How far ahead of UTC `zone` is right now, in whole minutes — what the zone picker
 * labels each row with ("GMT+5:30"). Read at an instant rather than stored, because
 * a zone's offset is only true until its next DST change.
 */
export const zoneOffsetMinutes = (instant: Date, zone: string): number =>
  offsetAt(instant, zone) / 60_000;

/**
 * The instant at which a clock in `zone` reads these calendar fields.
 *
 * Two passes for the same reason the server's version has them: the offset must be
 * looked up at an instant, and the instant is what we are solving for. The first
 * guess uses the offset for the wall clock read as UTC, the second corrects it with
 * the offset that actually applies where the guess landed.
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

/**
 * Midnight in `zone` on a calendar date, as a real instant. What a picked day has
 * to become before it can be stored — a bill due "on the 12th" is due at the start
 * of the 12th where the user lives, and storing UTC midnight instead would make it
 * the 11th for anyone west of Greenwich.
 */
export const startOfCalendarDay = (calendar: Date, zone: string): Date =>
  instantInZone(
    zone,
    calendar.getUTCFullYear(),
    calendar.getUTCMonth() + 1,
    calendar.getUTCDate(),
  );

/**
 * A `YYYY-MM-DD` or `YYYY-MM` key from the API back into a calendar date. Parsed
 * from its fields rather than by `new Date(key)`, which would read it as an instant
 * at UTC midnight and then need un-shifting again — the key never described a moment
 * in the first place.
 */
export const calendarFromKey = (key: string): Date => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day ?? 1));
};

/** Whole calendar days from `a` to `b` — positive when `b` is later. */
export const calendarDaysBetween = (a: Date, b: Date): number =>
  Math.round((b.getTime() - a.getTime()) / 86_400_000);
