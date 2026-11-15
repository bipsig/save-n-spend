import { test } from "node:test";
import assert from "node:assert/strict";
import { fake } from "../test/node";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/zone.test.ts

const session = { user: { prefs: { timeZone: "Asia/Kolkata" as string | undefined } } as { prefs?: { timeZone?: string } } | null };
fake("@/store/session", { useSession: { getState: () => session } });

const zone = require("./zone") as typeof import("./zone");
const KOLKATA = "Asia/Kolkata";
const NEW_YORK = "America/New_York";

// 00:30 on Monday 16 Nov in India, still the 15th in UTC and in New York.
const AFTER_MIDNIGHT_IST = new Date("2026-11-15T19:00:00Z");

test("the zone is the account's, else the phone's", () => {
  assert.equal(zone.appZone(), KOLKATA);
  session.user = { prefs: {} };
  assert.equal(zone.appZone(), zone.deviceZone());
  session.user = null;
  assert.equal(zone.appZone(), zone.deviceZone());
  session.user = { prefs: { timeZone: KOLKATA } };
  assert.equal(zone.zoneMatchesDevice(zone.deviceZone()), true);
  assert.equal(zone.zoneMatchesDevice("Not/AZone"), false);
});

test("what the clock reads in a zone", () => {
  assert.deepEqual(zone.zonedParts(AFTER_MIDNIGHT_IST, KOLKATA), { year: 2026, month: 11, day: 16, hour: 0, minute: 30 });
  assert.deepEqual(zone.zonedParts(AFTER_MIDNIGHT_IST, NEW_YORK), { year: 2026, month: 11, day: 15, hour: 14, minute: 0 });
});

test("the day and month an instant falls on depend on the zone, not UTC", () => {
  assert.equal(zone.dayKey(AFTER_MIDNIGHT_IST, KOLKATA), "2026-11-16");
  assert.equal(zone.dayKey(AFTER_MIDNIGHT_IST, NEW_YORK), "2026-11-15");
  const lastNight = new Date("2026-11-30T19:00:00Z");
  assert.equal(zone.monthKeyOf(lastNight, KOLKATA), "2026-12");
  assert.equal(zone.monthKeyOf(lastNight, "UTC"), "2026-11");
  assert.equal(zone.calendarDate(lastNight, KOLKATA).toISOString(), "2026-12-01T00:00:00.000Z");
});

test("offsets, including half-hour zones and daylight saving", () => {
  assert.equal(zone.zoneOffsetMinutes(AFTER_MIDNIGHT_IST, KOLKATA), 330);
  assert.equal(zone.zoneOffsetMinutes(AFTER_MIDNIGHT_IST, "Asia/Kathmandu"), 345);
  assert.equal(zone.zoneOffsetMinutes(new Date("2026-01-15T12:00:00Z"), NEW_YORK), -300);
  assert.equal(zone.zoneOffsetMinutes(new Date("2026-07-15T12:00:00Z"), NEW_YORK), -240);
});

test("the instant a wall-clock reading happens, either side of a DST change", () => {
  assert.equal(zone.instantInZone(KOLKATA, 2026, 11, 16).toISOString(), "2026-11-15T18:30:00.000Z");
  // New York springs forward at 02:00 on 8 Mar 2026.
  assert.equal(zone.instantInZone(NEW_YORK, 2026, 3, 8).toISOString(), "2026-03-08T05:00:00.000Z");
  assert.equal(zone.instantInZone(NEW_YORK, 2026, 3, 8, 12).toISOString(), "2026-03-08T16:00:00.000Z");
  assert.equal(zone.instantInZone(NEW_YORK, 2026, 11, 1, 12).toISOString(), "2026-11-01T17:00:00.000Z");
});

test("a picked day starts at that zone's midnight", () => {
  assert.equal(zone.startOfCalendarDay(zone.calendarFromKey("2026-11-16"), KOLKATA).toISOString(), "2026-11-15T18:30:00.000Z");
  assert.equal(zone.startOfCalendarDay(zone.calendarFromKey("2026-11-16"), NEW_YORK).toISOString(), "2026-11-16T05:00:00.000Z");
});

test("API keys parse as calendar dates; days between are whole", () => {
  assert.equal(zone.calendarFromKey("2026-11-16").toISOString(), "2026-11-16T00:00:00.000Z");
  assert.equal(zone.calendarFromKey("2026-11").toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(zone.calendarDaysBetween(zone.calendarFromKey("2026-03-01"), zone.calendarFromKey("2026-03-31")), 30);
  assert.equal(zone.calendarDaysBetween(zone.calendarFromKey("2026-11-16"), zone.calendarFromKey("2026-11-15")), -1);
  assert.equal(zone.calendarDaysBetween(zone.calendarFromKey("2028-02-28"), zone.calendarFromKey("2028-03-01")), 2);
});
