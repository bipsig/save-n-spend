import { test } from "node:test";
import assert from "node:assert/strict";
import { fake } from "../test/node";
import type { GrowthPoint, MonthPoint } from "@save-n-spend/types";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/chartSummaries.test.ts

fake("@/store/session", { useSession: { getState: () => ({ user: { prefs: { timeZone: "Asia/Kolkata" } } }) } });
const s = require("./chartSummaries") as typeof import("./chartSummaries");

test("the preposition follows the chart's own labels", () => {
  assert.equal(s.prepositionFor("12 Nov"), "on");
  assert.equal(s.prepositionFor("5 Mar 2025"), "on");
  assert.equal(s.prepositionFor("Sep 2026"), "in");
  assert.equal(s.prepositionFor("September 2026"), "in");
  assert.equal(s.prepositionFor("Oct"), "in");
  assert.equal(s.prepositionFor("9 pm"), "at");
  assert.equal(s.prepositionFor("12 am"), "at");
});

test("area: the total, then the heaviest bucket, in exact paise", () => {
  assert.equal(
    s.areaSummary("Spending", [0, 420000, 120050], ["11 Nov", "12 Nov", "13 Nov"], false),
    "Spending, chart. ₹5,400.50 in all, highest ₹4,200.00 on 12 Nov.",
  );
  assert.equal(s.areaSummary("Spending", [0, 0], ["Sep 2026", "Oct 2026"], false), "Spending, chart. ₹0.00 in all.");
  assert.equal(s.areaSummary("Spending", [], [], false), "Spending, chart. Nothing to show yet.");
  assert.equal(s.areaSummary("Spending", [100], ["9 pm"], true), "Spending, chart. Amounts hidden.");
});

test("dual line: so far, the previous period at the same point, the projection", () => {
  assert.equal(
    s.dualLineSummary({ current: [100, 300], previous: [50, 250, 900], currentLabel: "This month", previousLabel: "Last month", projectedEnd: 1500 }, false),
    "This month against Last month, chart. This month ₹3.00 so far, Last month ₹2.50 at the same point, on pace for ₹15.00.",
  );
  assert.equal(
    s.dualLineSummary({ current: [], previous: [], currentLabel: "This week", previousLabel: "Last week" }, false),
    "This week against Last week, chart. Nothing to show yet.",
  );
});

test("paired columns: the latest unit, then the heaviest spending", () => {
  assert.equal(
    s.pairedSummary([{ income: 8000000, expense: 1470000 }, { income: 0, expense: 230000 }], ["Oct", "Nov"], false),
    "Income and expenses, chart. Nov: income ₹0.00, expenses ₹2,300.00, highest spending ₹14,700.00 in Oct.",
  );
});

test("donut: the whole and the three biggest shares, one decimal", () => {
  assert.equal(
    s.donutSummary("Total spent", 1000000, [
      { name: "Rent", pct: 62.44 }, { name: "Food", pct: 20 }, { name: "Fuel", pct: 10 }, { name: "Other", pct: 7.56 },
    ], false),
    "Total spent, chart. ₹10,000.00 in all, Rent 62.4%, Food 20.0%, Fuel 10.0%.",
  );
});

const month = (label: string, value: number, invested: number): MonthPoint =>
  ({ month: label, label, value, invested, upd: true, contrib: 0 });
const grow = (label: string, growth: number | null, opening = false): GrowthPoint =>
  ({ month: label, label, growth, pct: null, upd: growth !== null, cover: 1, opening });

test("value history: latest value, money put in and the signed gain", () => {
  assert.equal(
    s.valueHistorySummary([month("Oct 2026", 100000, 90000), month("Nov 2026", 95000, 100000)], false),
    "Value over time, chart. ₹950.00 in Nov 2026, ₹1,000.00 invested, −₹50.00 gain.",
  );
});

test("profit: so far, best and worst months; the opening month is not growth", () => {
  const points = [month("Sep 2026", 100, 0), month("Oct 2026", 1300, 0), month("Nov 2026", 900, 0)];
  assert.equal(
    s.profitSummary(points, [grow("Sep 2026", 5000, true), grow("Oct 2026", 1200), grow("Nov 2026", -400)], false),
    "Profit and loss, chart. +₹9.00 profit so far, best month +₹12.00 in Oct 2026, worst month −₹4.00 in Nov 2026.",
  );
  // Nothing fell, so there is no worst month to name.
  assert.equal(
    s.profitSummary(points.slice(0, 2), [grow("Sep 2026", null, true), grow("Oct 2026", 1200)], false),
    "Profit and loss, chart. +₹13.00 profit so far, best month +₹12.00 in Oct 2026.",
  );
});

test("forecast: where it ends and whether it dips below zero", () => {
  assert.equal(s.forecastSummary([5000, -200, 300], false), "Balance forecast to month end, chart. Ends at ₹3.00, goes below zero before then.");
  assert.equal(s.forecastSummary([5000, 4000], false), "Balance forecast to month end, chart. Ends at ₹40.00, stays above zero.");
  assert.equal(s.forecastSummary([5000, 4000], true), "Balance forecast to month end, chart. Amounts hidden.");
});

test("holding sparkline: months held in the account zone, first and latest value", () => {
  const now = new Date("2026-11-17T06:00:00Z");
  assert.equal(
    s.holdingSparkSummary([10000000, 9500000, 11240000], "2026-03-10T05:00:00Z", false, now),
    "Value over 8 months, chart. From ₹1,00,000.00 to ₹1,12,400.00.",
  );
  // 31 Oct 20:00 UTC is already 1 Nov in India: this month, not one month.
  assert.equal(s.holdingSparkSummary([100, 200], "2026-10-31T20:00:00Z", false, now), "Value this month, chart. From ₹1.00 to ₹2.00.");
  assert.equal(s.holdingSparkSummary([100, 200], "2025-11-01T00:00:00Z", false, now), "Value over 12 months, chart. From ₹1.00 to ₹2.00.");
  assert.equal(s.holdingSparkSummary([100, 200], "2026-03-10T05:00:00Z", true, now), "Value over 8 months, chart. Amounts hidden.");
});

