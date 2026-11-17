import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { fake } from "../test/node";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/formatDate.test.ts
//
// lib/format/date.ts and lib/format/period.ts with the clock fixed and the account zone set.

const session = { user: { prefs: { timeZone: "Asia/Kolkata" } } };
fake("@/store/session", { useSession: { getState: () => session } });

const { formatInstant, formatCalendar, formatClock, localCalendar, capitalise, MONTHS } =
  require("./format/date") as typeof import("./format/date");
const { formatSpan, relativePeriod } = require("./format/period") as typeof import("./format/period");

// Monday 16 Nov 2026, 12:00 in India.
const NOON_IST = Date.parse("2026-11-16T06:30:00Z");
const at = (iso: string) => Date.parse(iso);

beforeEach(() => {
  session.user.prefs.timeZone = "Asia/Kolkata";
  mock.timers.enable({ apis: ["Date"], now: NOON_IST });
});
afterEach(() => mock.timers.reset());

test("one month table: Sep, never Sept", () => {
  assert.equal(MONTHS[8], "Sep");
  assert.equal(formatCalendar("2026-09-01", "day"), "1 Sep");
  assert.equal(formatCalendar("2026-09-01", "weekday"), "Tue, 1 Sep");
  assert.equal(formatCalendar("2026-09", "month"), "Sep 2026");
  assert.equal(formatCalendar("2026-09", "monthLong"), "September 2026");
});

test("the year is added only when it isn't this year", () => {
  assert.equal(formatCalendar("2026-03-12"), "12 Mar");
  assert.equal(formatCalendar("2025-03-05"), "5 Mar 2025");
  assert.equal(formatCalendar("2026-03-12", "dayYear"), "12 Mar 2026");
  assert.equal(formatCalendar("2026-11-20", "dayLong"), "20 November");
  assert.equal(formatCalendar("2027-01-02", "dayLong"), "2 January 2027");
  assert.equal(formatCalendar("2025-11-07", "weekday"), "Fri, 7 Nov 2025");
});

test("time is lower case with a space: 3:58 pm", () => {
  assert.equal(formatClock(15, 58), "3:58 pm");
  assert.equal(formatClock(9, 12), "9:12 am");
  assert.equal(formatClock(0, 5), "12:05 am");
  assert.equal(formatClock(12, 0), "12:00 pm");
  assert.equal(formatInstant("2026-11-16T10:28:00Z", "time"), "3:58 pm");
});

test("a moment is read in the account zone, not the device's", () => {
  // 23:30 on 15 Nov in India is 18:00 UTC; 00:30 on the 16th is 19:00 UTC.
  assert.equal(formatInstant(at("2026-11-15T18:00:00Z"), "day"), "15 Nov");
  assert.equal(formatInstant(at("2026-11-15T19:00:00Z"), "day"), "16 Nov");
  assert.equal(formatInstant(at("2026-11-15T19:00:00Z"), "dayTime"), "Today, 12:30 am");
  assert.equal(formatInstant(at("2026-11-15T18:00:00Z"), "dayTime"), "Yesterday, 11:30 pm");

  // The same two instants in New York are both the 15th, in the afternoon.
  session.user.prefs.timeZone = "America/New_York";
  assert.equal(formatInstant(at("2026-11-15T18:00:00Z"), "day"), "15 Nov");
  assert.equal(formatInstant(at("2026-11-15T19:00:00Z"), "day"), "15 Nov");
  assert.equal(formatInstant(at("2026-11-15T19:00:00Z"), "time"), "2:00 pm");
  // Noon in India is 01:30 on the 16th in New York, so the 15th is yesterday there too.
  assert.equal(formatInstant(at("2026-11-15T19:00:00Z"), "dayTime"), "Yesterday, 2:00 pm");
  // 23:30 on the 15th in New York is 04:30 UTC on the 16th: still the 15th.
  assert.equal(formatInstant(at("2026-11-16T04:30:00Z"), "dayTime"), "Yesterday, 11:30 pm");
  assert.equal(formatInstant(at("2026-11-16T05:30:00Z"), "dayTime"), "Today, 12:30 am");
});

test("an explicit zone wins over the account's", () => {
  assert.equal(formatInstant(at("2026-11-15T19:00:00Z"), "day", "Europe/London"), "15 Nov");
});

test("a calendar day is never shifted by the zone", () => {
  session.user.prefs.timeZone = "America/Los_Angeles";
  assert.equal(formatCalendar("2026-11-20", "dayLong"), "20 November");
  assert.equal(formatCalendar(new Date(Date.UTC(2026, 10, 1)), "day"), "1 Nov");
});

test("a picker's device-local Date keeps the day on its wheels", () => {
  const picked = new Date(2026, 10, 1, 23, 30);
  assert.equal(formatCalendar(localCalendar(picked), "dayYear"), "1 Nov 2026");
});

test("relative days for bills and relative times for lists", () => {
  assert.equal(formatInstant("2026-11-16T03:00:00Z", "relativeDay"), "today");
  assert.equal(formatInstant("2026-11-15T03:00:00Z", "relativeDay"), "yesterday");
  assert.equal(formatInstant("2026-11-17T03:00:00Z", "relativeDay"), "tomorrow");
  assert.equal(formatInstant("2026-11-12T03:00:00Z", "relativeDay"), "12 Nov");

  assert.equal(formatInstant(NOON_IST - 20_000, "relative"), "just now");
  assert.equal(formatInstant(NOON_IST - 12 * 60_000, "relative"), "12 min ago");
  assert.equal(formatInstant(NOON_IST - 3 * 3_600_000, "relative"), "3 h ago");
  assert.equal(formatInstant("2026-11-15T14:00:00Z", "relative"), "yesterday");
  assert.equal(formatInstant("2026-11-13T06:30:00Z", "relative"), "3 days ago");
  assert.equal(formatInstant("2026-11-09T06:30:00Z", "relative"), "9 Nov");
  assert.equal(capitalise(formatInstant("2026-11-15T14:00:00Z", "relative")), "Yesterday");
});

test("spans: one month once, across months both, across years both years", () => {
  assert.equal(formatSpan("2026-09-01", "2026-09-07"), "1–7 Sep");
  assert.equal(formatSpan("2026-11-02", "2026-11-08"), "2–8 Nov");
  assert.equal(formatSpan("2026-10-26", "2026-11-01"), "26 Oct – 1 Nov");
  assert.equal(formatSpan("2025-12-29", "2026-01-04"), "29 Dec 2025 – 4 Jan 2026");
  assert.equal(formatSpan("2026-11-16", "2026-11-16"), "16 Nov");
  assert.equal(formatSpan("2025-11-24", "2025-11-30"), "24–30 Nov 2025");
  assert.equal(formatSpan("2026-11-09", "2026-11-15", { year: "always" }), "9–15 Nov 2026");
  assert.equal(formatSpan("2025-12-29", "2026-01-04", { year: "never" }), "29 Dec – 4 Jan");
});

test("the current and previous period by name, sentence case", () => {
  assert.equal(relativePeriod("week", 0), "This week");
  assert.equal(relativePeriod("week", -1), "Last week");
  assert.equal(relativePeriod("month", -1), "Last month");
  assert.equal(relativePeriod("day", 0), "Today");
  assert.equal(relativePeriod("day", -1), "Yesterday");
  assert.equal(relativePeriod("all", 0), "All time");
  assert.equal(relativePeriod("year", -2), null);
});
