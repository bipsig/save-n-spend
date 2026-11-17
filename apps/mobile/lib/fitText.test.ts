import { test } from "node:test";
import assert from "node:assert/strict";
import { fitFontSize, statColumns, textWidth, toRows, tooltipLeft } from "./fitText";

test("the width estimate errs wide of what the mockup measured", () => {
  // Mockup 02 at 13 pt: "+₹11,689.58" drew about 76 pt wide.
  const w = textWidth("+₹11,689.58", 13);
  assert.ok(w >= 76 && w <= 84, `got ${w}`);
  assert.ok(textWidth("₹1,000", 13) < textWidth("₹10,000", 13));
  assert.equal(textWidth("", 13), 0);
  assert.ok(Math.abs(textWidth("11", 10, 1) - 14.4) < 1e-9);
});

// Trends: a 390 pt phone, 20 pt screen padding, 8 pt gaps, 10 pt tile padding, 13 pt minimum.
const TRENDS = { gap: 8, padding: 10, fontSize: 13 };
const ROW = 350;

test("today's Trends figures fit three across", () => {
  assert.equal(statColumns(["+₹11,689.58", "+₹18,240.12", "−₹9,412.40"], ROW, TRENDS), 3);
});

test("a figure too wide for a third of the row drops the row to two across, then one", () => {
  assert.equal(statColumns(["+₹12,34,567.89", "+₹18,240.12", "−₹9,412.40"], ROW, TRENDS), 2);
  assert.equal(statColumns(["+₹1,23,45,67,89,012.34", "+₹1.00", "−₹1.00"], ROW, TRENDS), 1);
});

test("the masked figure is short and always fits", () => {
  assert.equal(statColumns(["+₹ ••••", "+₹ ••••", "−₹ ••••"], ROW, TRENDS), 3);
});

test("before the row is measured, every tile stays across", () => {
  assert.equal(statColumns(["+₹12,34,56,789.00", "a", "b"], 0, TRENDS), 3);
  assert.equal(statColumns([], 300, TRENDS), 1);
});

test("rows of tiles: the last row takes what is left", () => {
  assert.deepEqual(toRows([1, 2, 3], 3), [[1, 2, 3]]);
  assert.deepEqual(toRows([1, 2, 3], 2), [[1, 2], [3]]);
  assert.deepEqual(toRows([1, 2, 3], 1), [[1], [2], [3]]);
  assert.deepEqual(toRows([], 2), []);
});

test("a tooltip centres on the finger but never leaves the chart or covers the axis", () => {
  assert.equal(tooltipLeft(150, 300, 164), 68);
  assert.equal(tooltipLeft(10, 300, 164), 0);
  assert.equal(tooltipLeft(295, 300, 164), 136);
  assert.equal(tooltipLeft(295, 300, 164, 46), 90);
  // A chart narrower than the tooltip pins it to the left edge.
  assert.equal(tooltipLeft(50, 100, 164), 0);
});

test("a caption keeps its size when it fits and shrinks no further than the floor", () => {
  assert.equal(fitFontSize(0, 100, 11.5, 0.8), 11.5, "not measured yet");
  assert.equal(fitFontSize(90, 100, 11.5, 0.8), 11.5);
  assert.equal(fitFontSize(110, 100, 11.5, 0.8), 10, "10.45 rounds down to 10");
  assert.equal(fitFontSize(200, 100, 10, 0.8), 8, "stops at 80%, then ellipsizes");
});
