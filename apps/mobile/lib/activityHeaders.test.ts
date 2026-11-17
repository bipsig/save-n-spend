import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { fake } from "../test/node";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/activityHeaders.test.ts

const session = { user: { prefs: { timeZone: "Asia/Kolkata" } } };
fake("@/store/session", { useSession: { getState: () => session } });

const { dayHeaderLabel, monthHeaderLabel } = require("./activityHeaders") as typeof import("./activityHeaders");

// Monday 16 Nov 2026, 12:00 in India.
const NOON_IST = Date.parse("2026-11-16T06:30:00Z");

beforeEach(() => {
  session.user.prefs.timeZone = "Asia/Kolkata";
  mock.timers.enable({ apis: ["Date"], now: NOON_IST });
});
afterEach(() => mock.timers.reset());

test("today and yesterday by name, in sentence case", () => {
  assert.equal(dayHeaderLabel("2026-11-16T03:00:00Z"), "Today");
  assert.equal(dayHeaderLabel("2026-11-15T10:00:00Z"), "Yesterday");
});

test("other days get the weekday, and the year when it isn't this one", () => {
  assert.equal(dayHeaderLabel("2026-09-01T06:30:00Z"), "Tue, 1 Sep");
  assert.equal(dayHeaderLabel("2025-09-07T06:30:00Z"), "Sun, 7 Sep 2025");
  // A future-dated entry is never "Tomorrow" here.
  assert.equal(dayHeaderLabel("2026-11-17T06:30:00Z"), "Tue, 17 Nov");
});

test("the day is cut in the account zone, not the device's", () => {
  // 23:30 on the 15th in India is 18:00 UTC: still yesterday in India.
  assert.equal(dayHeaderLabel("2026-11-15T18:00:00Z"), "Yesterday");
  // 00:30 on the 16th in India.
  assert.equal(dayHeaderLabel("2026-11-15T19:00:00Z"), "Today");
});

test("month breaks are written out", () => {
  assert.equal(monthHeaderLabel("2026-08-12T06:30:00Z"), "August 2026");
  assert.equal(monthHeaderLabel("2026-08-31T19:00:00Z"), "September 2026");
});
