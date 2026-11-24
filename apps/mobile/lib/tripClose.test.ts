import { test } from "node:test";
import assert from "node:assert/strict";
import "../test/node";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/tripClose.test.ts

const c = require("./tripClose") as typeof import("./tripClose");

// Udupi: trip dates 1–5 Oct, expenses 9–21 Oct, today 22 Nov.
const RANGE = c.closeRange("2026-10-01", "2026-11-22");

test("close range: trip start to today; a trip starting later still allows today", () => {
  assert.deepEqual(RANGE, { first: "2026-10-01", today: "2026-11-22" });
  assert.deepEqual(c.closeRange("2026-12-01", "2026-11-22"), { first: "2026-11-22", today: "2026-11-22" });
  assert.equal(c.inRange("2026-10-21", RANGE), true);
  assert.equal(c.inRange("2026-09-30", RANGE), false);
  assert.equal(c.inRange("2026-11-23", RANGE), false);
});

test("default close day: the last expense day, kept in range; today with no expenses", () => {
  assert.equal(c.defaultCloseDay(["2026-10-09", "2026-10-21", "2026-10-17"], RANGE), "2026-10-21");
  assert.equal(c.defaultCloseDay(["2026-09-20"], RANGE), "2026-10-01");
  assert.equal(c.defaultCloseDay(["2026-12-01"], RANGE), "2026-11-22");
  assert.equal(c.defaultCloseDay([], RANGE), "2026-11-22");
  assert.equal(c.isLastExpenseDay("2026-10-21", ["2026-10-09", "2026-10-21", "2026-10-17"]), true);
  assert.equal(c.isLastExpenseDay("2026-10-17", ["2026-10-09", "2026-10-21", "2026-10-17"]), false);
  assert.equal(c.isLastExpenseDay("2026-11-22", []), false);
});

test("month grid: Sunday first, padded weeks; October 2026 starts on a Thursday", () => {
  const weeks = c.monthGrid("2026-10");
  assert.equal(weeks.length, 5);
  assert.deepEqual(weeks[0], [null, null, null, null, "2026-10-01", "2026-10-02", "2026-10-03"]);
  assert.deepEqual(weeks[4].slice(0, 7), ["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"]);
  assert.equal(c.monthTitle("2026-10"), "October 2026");
  assert.equal(c.shiftMonth("2026-01", -1), "2025-12");
  assert.equal(c.shiftMonth("2026-12", 1), "2027-01");
});

test("moving the day names the months it moves between", () => {
  assert.deepEqual(c.movesBetween("2026-11-12", "2026-10-21"), { from: "November", to: "October" });
  assert.equal(c.movesBetween("2026-10-12", "2026-10-21"), null);
  assert.equal(c.movesBetween(null, "2026-10-21"), null);
  assert.deepEqual(c.movesBetween("2027-01-02", "2026-12-30"), { from: "January 2027", to: "December 2026" });
});
