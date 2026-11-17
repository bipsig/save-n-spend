import { afterEach, test, mock } from "node:test";
import assert from "node:assert/strict";
import { fake } from "../test/node";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/offlineBanner.test.ts
//
// D18 A: the offline banner states the age of this screen's saved data, in the account zone.

fake("@/store/session", { useSession: { getState: () => ({ user: { prefs: { timeZone: "Asia/Kolkata" } } }) } });

const { offlineBannerText, savedWhen } = require("./offlineBanner") as typeof import("./offlineBanner");

const IST = "Asia/Kolkata";
const NY = "America/New_York";
const now = (iso: string) => {
  mock.timers.reset();
  mock.timers.enable({ apis: ["Date"], now: Date.parse(iso) });
};
afterEach(() => mock.timers.reset());

test("today, yesterday, and older with the day only", () => {
  now("2026-11-16T06:30:00Z"); // Mon 16 Nov, 12:00 IST
  assert.equal(offlineBannerText(Date.parse("2026-11-16T05:22:00Z"), null, IST), "Offline · showing what was saved today at 10:52 am");
  assert.equal(offlineBannerText(Date.parse("2026-11-15T15:45:00Z"), null, IST), "Offline · showing what was saved yesterday at 9:15 pm");
  assert.equal(offlineBannerText(Date.parse("2026-11-12T04:00:00Z"), null, IST), "Offline · showing what was saved on 12 Nov");
  assert.equal(offlineBannerText(Date.parse("2025-11-12T04:00:00Z"), null, IST), "Offline · showing what was saved on 12 Nov 2025");
});

test("across midnight the day follows the account zone, not the gap in hours", () => {
  // 00:10 IST on 17 Nov; saved 20 minutes earlier, at 23:50 IST on 16 Nov.
  now("2026-11-16T18:40:00Z");
  const saved = Date.parse("2026-11-16T18:20:00Z");
  assert.equal(savedWhen(saved, IST), "yesterday at 11:50 pm");
  // The same two instants in New York are 1:20 pm and 1:40 pm on 16 Nov.
  assert.equal(savedWhen(saved, NY), "today at 1:20 pm");

  // 00:05 in New York on 17 Nov, saved at 23:55 there: yesterday. In India both are mid-morning on the 17th.
  now("2026-11-17T05:05:00Z");
  const late = Date.parse("2026-11-17T04:55:00Z");
  assert.equal(savedWhen(late, NY), "yesterday at 11:55 pm");
  assert.equal(savedWhen(late, IST), "today at 10:25 am");
});

test("a saved time ahead of the phone's clock still reads today", () => {
  now("2026-11-16T06:30:00Z");
  assert.equal(savedWhen(Date.parse("2026-11-17T06:30:00Z"), IST), "today at 12:00 pm");
});

test("without fetchedAt the 2.8.2 line stays", () => {
  now("2026-11-16T06:30:00Z");
  assert.equal(offlineBannerText(undefined, Date.parse("2026-11-15T15:45:00Z"), IST), "Offline — showing data from 9:15 pm");
  assert.equal(offlineBannerText(null, null, IST), "Offline — showing saved data");
});
