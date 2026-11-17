import { test } from "node:test";
import assert from "node:assert/strict";
import { chartA11y, chartSummary, extremeIndex, peakPhrase } from "./chartSummary";

// Stands in for the app's formatter: the summary must use whatever it is given.
const rupees = (p: number) => `₹${(p / 100).toFixed(2)}`;

test("a summary names the chart, then its facts in one sentence", () => {
  const s = chartSummary({
    title: "Spending this month",
    masked: false,
    parts: [`${rupees(4231840)} so far`, peakPhrase([0, 420000, 120000], ["11 Nov", "12 Nov", "13 Nov"], rupees)],
  });
  assert.equal(s, "Spending this month, chart. ₹42318.40 so far, highest ₹4200.00 on 12 Nov.");
});

test("privacy on: no amount is spoken", () => {
  const s = chartSummary({ title: "Portfolio value", masked: true, parts: [`${rupees(45700000)} now`] });
  assert.equal(s, "Portfolio value, chart. Amounts hidden.");
  assert.ok(!s.includes("₹"));
});

test("empty facts are skipped; the first fact is capitalised; no double full stop", () => {
  assert.equal(
    chartSummary({ title: "Spending", masked: false, parts: [null, false, "highest ₹1.00 on 1 Nov."] }),
    "Spending, chart. Highest ₹1.00 on 1 Nov.",
  );
  assert.equal(chartSummary({ title: "Spending", masked: false, parts: [] }), "Spending, chart. Nothing to show yet.");
  assert.equal(chartSummary({ title: "Cash flow", masked: false, parts: [], empty: "no money moved" }), "Cash flow, chart. No money moved.");
});

test("extremes skip gaps and keep the first of a tie", () => {
  assert.equal(extremeIndex([3, null, 7, 7, undefined], "max"), 2);
  assert.equal(extremeIndex([3, -2, 7, -2], "min"), 1);
  assert.equal(extremeIndex([null, undefined], "max"), null);
  assert.equal(extremeIndex([], "min"), null);
});

test("a peak phrase needs something to name", () => {
  assert.equal(peakPhrase([0, 0], ["a", "b"], rupees), null);
  assert.equal(peakPhrase([], [], rupees), null);
  assert.equal(peakPhrase([0, 0], ["Sep", "Oct"], rupees, { nonZero: false }), "highest ₹0.00 on Sep");
  assert.equal(peakPhrase([500, -941240], ["Sep", "Oct"], rupees, { which: "min", word: "worst month", preposition: "in" }), "worst month ₹-9412.40 in Oct");
  assert.equal(peakPhrase([500], [], rupees), "highest ₹5.00");
});

test("the a11y props make the chart one element that reads the summary", () => {
  assert.deepEqual(chartA11y("X, chart. Y."), { accessible: true, accessibilityLabel: "X, chart. Y." });
});
