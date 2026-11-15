import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { fake } from "../test/node";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/date.test.ts
//
// lib/date.ts and lib/dateRange.ts with the clock fixed and the account zone set.

const session = { user: { prefs: { timeZone: "Asia/Kolkata" } } };
fake("@/store/session", { useSession: { getState: () => session } });

const date = require("./date") as typeof import("./date");
const range = require("./dateRange") as typeof import("./dateRange");

// 00:30 on Monday 16 Nov 2026 in India; the device's UTC date is still the 15th.
const NOW = Date.parse("2026-11-15T19:00:00Z");
const istMidnight = (day: string) => new Date(Date.parse(`${day}T00:00:00+05:30`)).toISOString();

beforeEach(() => {
  session.user.prefs.timeZone = "Asia/Kolkata";
  mock.timers.enable({ apis: ["Date"], now: NOW });
});
afterEach(() => mock.timers.reset());

test("rows say Today and Yesterday by the account's day", () => {
  assert.match(date.formatTxnDate("2026-11-15T18:45:00Z"), /^Today, /);
  assert.match(date.formatTxnDate("2026-11-15T18:15:00Z"), /^Yesterday, /);
  assert.match(date.formatTxnDate("2026-11-10T06:00:00Z"), /Nov/);
  // The same instant in New York is still the 15th.
  session.user.prefs.timeZone = "America/New_York";
  assert.match(date.formatTxnDate("2026-11-15T18:45:00Z"), /^Today, /);
  assert.match(date.formatTxnDate("2026-11-15T03:00:00Z"), /^Yesterday, /);
});

test("due labels count whole days in the account's zone", () => {
  assert.equal(date.formatDueLabel(istMidnight("2026-11-16"), "pending"), "Due today");
  assert.equal(date.formatDueLabel(istMidnight("2026-11-17"), "pending"), "Due tomorrow");
  assert.equal(date.formatDueLabel(istMidnight("2026-11-19"), "pending"), "Due in 3 days");
  assert.equal(date.formatDueLabel(istMidnight("2026-11-15"), "overdue"), "Overdue by 1 day");
  assert.equal(date.formatDueLabel(istMidnight("2026-11-13"), "overdue"), "Overdue by 3 days");
  assert.match(date.formatDueLabel(istMidnight("2026-11-20"), "paid", "2026-11-15T19:00:00Z"), /^Paid Today, /);
});

test("rolling a due date clamps to the month's last day, in the account's zone", () => {
  assert.equal(date.rollDueDate(istMidnight("2026-01-31"), "monthly"), istMidnight("2026-02-28"));
  assert.equal(date.rollDueDate(istMidnight("2028-01-31"), "monthly"), istMidnight("2028-02-29"));
  assert.equal(date.rollDueDate(istMidnight("2026-12-15"), "monthly"), istMidnight("2027-01-15"));
  assert.equal(date.rollDueDate(istMidnight("2028-02-29"), "yearly"), istMidnight("2029-02-28"));
});

test("a picked day becomes that day's midnight in the account's zone", () => {
  assert.equal(date.toZonedDayISO(new Date(2026, 10, 1, 15, 0)), istMidnight("2026-11-01"));
  session.user.prefs.timeZone = "America/New_York";
  assert.equal(date.toZonedDayISO(new Date(2026, 10, 1)), "2026-11-01T04:00:00.000Z");
});

test("Activity headers", () => {
  assert.equal(date.dayGroupLabel("2026-11-15T18:45:00Z"), "TODAY");
  assert.equal(date.dayGroupLabel("2026-11-15T10:00:00Z"), "YESTERDAY");
  assert.match(date.dayGroupLabel("2026-11-07T10:00:00Z"), /^SAT, 7 NOV$/);
  assert.match(date.dayGroupLabel("2025-11-07T10:00:00Z"), /2025/);
  assert.equal(date.monthGroupLabel("2026-11-30T19:00:00Z"), "DECEMBER 2026");
  assert.match(date.formatFullDate("2026-11-30T19:00:00Z"), /1 Dec 2026/);
});

test("ranges anchor on today in the account's zone", () => {
  assert.deepEqual(range.rangeBounds("day"), { startDate: "2026-11-16", endDate: "2026-11-16" });
  assert.deepEqual(range.rangeBounds("day", -1), { startDate: "2026-11-15", endDate: "2026-11-15" });
  assert.deepEqual(range.rangeBounds("day", 1), { startDate: "2026-11-17", endDate: "2026-11-16" });
  session.user.prefs.timeZone = "America/New_York";
  assert.deepEqual(range.rangeBounds("day"), { startDate: "2026-11-15", endDate: "2026-11-15" });
});

test("week, month and year windows: Monday start, past ones whole, the current one clamped to today", () => {
  assert.deepEqual(range.rangeBounds("week"), { startDate: "2026-11-16", endDate: "2026-11-16" });
  assert.deepEqual(range.rangeBounds("week", -1), { startDate: "2026-11-09", endDate: "2026-11-15" });
  assert.deepEqual(range.rangeBounds("month"), { startDate: "2026-11-01", endDate: "2026-11-16" });
  assert.deepEqual(range.rangeBounds("month", -9), { startDate: "2026-02-01", endDate: "2026-02-28" });
  assert.deepEqual(range.rangeBounds("month", -11), { startDate: "2025-12-01", endDate: "2025-12-31" });
  assert.deepEqual(range.rangeBounds("year"), { startDate: "2026-01-01", endDate: "2026-11-16" });
  assert.deepEqual(range.rangeBounds("year", -1), { startDate: "2025-01-01", endDate: "2025-12-31" });
  assert.deepEqual(range.rangeBounds("all"), {});
});

test("range labels for the summary card and the navigator", () => {
  assert.equal(range.rangeLabel("day"), "16 NOV 2026");
  assert.equal(range.rangeLabel("week", -1), "9–15 NOV 2026");
  assert.equal(range.rangeLabel("week", -3), "26 OCT – 1 NOV 2026");
  assert.equal(range.rangeLabel("month"), "NOVEMBER 2026");
  assert.equal(range.rangeLabel("year", -1), "2025");
  assert.equal(range.rangeLabel("all"), "ALL TIME");

  assert.equal(range.rangeNavLabel("day"), "Today");
  assert.equal(range.rangeNavLabel("day", -1), "Yesterday");
  assert.equal(range.rangeNavLabel("day", -2), "14 Nov");
  assert.equal(range.rangeNavLabel("week", -1), "Last Week");
  assert.equal(range.rangeNavLabel("week", -3), "26 Oct – 1 Nov");
  assert.equal(range.rangeNavLabel("month", -1), "Last Month");
  assert.equal(range.rangeNavLabel("month", -2), "September 2026");
  assert.equal(range.rangeNavLabel("year"), "This Year");
  assert.equal(range.rangeNavLabel("year", -2), "2024");
  assert.equal(range.rangeNavLabel("all"), "All Time");
});

test("isRangeKey accepts only the five keys", () => {
  for (const key of ["day", "week", "month", "year", "all"]) assert.equal(range.isRangeKey(key), true);
  for (const value of ["Day", "", "quarter", 1, null, undefined]) assert.equal(range.isRangeKey(value), false);
});
