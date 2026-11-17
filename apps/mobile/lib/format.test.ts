import { test } from "node:test";
import assert from "node:assert/strict";
import { fake } from "../test/node";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/format.test.ts
//
// lib/format/{money,compact,pct,count}.ts. Dates are in lib/formatDate.test.ts.

const settings = { privacyMode: false, peeking: false };
fake("@/store/settings", { useSettings: { getState: () => settings } });

const money = require("./format/money") as typeof import("./format/money");
const { formatCompact, formatCompactExact } = require("./format/compact") as typeof import("./format/compact");
const { formatPct, formatPoints, percentOf } = require("./format/pct") as typeof import("./format/pct");
const { count } = require("./format/count") as typeof import("./format/count");

test("one minus, U+2212, and a zero never signed", () => {
  assert.equal(money.MINUS, "\u2212");
  assert.equal(money.signFor(-1), "−");
  assert.equal(money.signFor(1), "");
  assert.equal(money.signFor(1, "always"), "+");
  assert.equal(money.signFor(0, "always"), "");
  assert.equal(money.signFor(-0, "always"), "");
  assert.equal(money.signFor(-1, "none"), "");
});

test("Indian grouping", () => {
  for (const [n, s] of [[0, "0"], [999, "999"], [1000, "1,000"], [99999, "99,999"], [100000, "1,00,000"],
    [1234567, "12,34,567"], [123456789, "12,34,56,789"]] as const) {
    assert.equal(money.groupIndian(n), s);
  }
});

test("balance and budget words", () => {
  assert.equal(money.balanceWord(-1, "credit_card"), "owed");
  assert.equal(money.balanceWord(-1, "bank"), "overdrawn");
  assert.equal(money.balanceWord(-1, "wallet"), "overdrawn");
  assert.equal(money.balanceWord(0, "bank"), "available");
  assert.equal(money.balanceWord(-0.4, "bank"), "available");
  assert.equal(money.remainingWord(-1), "over");
  assert.equal(money.remainingWord(0), "left");
});

test("compact rounds first, then picks k / L / Cr", () => {
  assert.equal(formatCompactExact(99_950), "₹1k"); // ₹999.50
  assert.equal(formatCompactExact(99_96_000), "₹1L"); // ₹99,960, was "₹100k"
  assert.equal(formatCompactExact(99_94_000), "₹99.9k");
  assert.equal(formatCompactExact(99_99_96_000), "₹1Cr"); // ₹99,99,960
  assert.equal(formatCompactExact(75_00_000), "₹75k");
  assert.equal(formatCompactExact(1_20_00_000), "₹1.2L");
  assert.equal(formatCompactExact(3_40_00_00_000), "₹3.4Cr");
  assert.equal(formatCompactExact(1_000_00_00_000), "₹10Cr");
  assert.equal(formatCompactExact(4250), "₹43");
  assert.equal(formatCompactExact(0), "₹0");
});

test("compact signs: true minus, plus on request, none on a zero", () => {
  assert.equal(formatCompactExact(-820000), "−₹8.2k"); // was "₹-8200" in the Insights PDF
  assert.equal(formatCompactExact(11_68_958, { sign: "always" }), "+₹11.7k");
  assert.equal(formatCompactExact(-40, { sign: "always" }), "₹0");
  assert.equal(formatCompactExact(-99_96_000), "−₹1L");
});

test("compact masks like every other amount; the file form never does", () => {
  settings.privacyMode = true;
  assert.equal(formatCompact(99_96_000), money.MASKED_MONEY);
  assert.equal(formatCompact(-820000, { sign: "always" }), "−₹ ••••");
  assert.equal(formatCompact(-40, { sign: "always" }), money.MASKED_MONEY);
  assert.equal(formatCompactExact(99_96_000), "₹1L");
  settings.peeking = true;
  assert.equal(formatCompact(99_96_000), "₹1L");
  settings.privacyMode = false;
  settings.peeking = false;
});

test("every percentage has one decimal, never dropped (D9 C)", () => {
  assert.equal(formatPct(24.66), "24.7%");
  assert.equal(formatPct(100), "100.0%");
  assert.equal(formatPct(0), "0.0%");
  assert.equal(formatPct(12.31, { kind: "change" }), "+12.3%");
  assert.equal(formatPct(-10.04, { kind: "return" }), "−10.0%");
  assert.equal(formatPct(8.45, { kind: "return" }), "+8.5%");
  assert.equal(formatPct(-8.45, { kind: "return" }), "−8.5%");
  // Rounds to zero: no sign, whatever the kind.
  assert.equal(formatPct(0.04, { kind: "change" }), "0.0%");
  assert.equal(formatPct(-0.04, { kind: "change" }), "0.0%");
  assert.equal(formatPct(Infinity, { kind: "change" }), "—");
  assert.equal(formatPct(NaN), "—");
});

test("rate changes are points, not percent", () => {
  assert.equal(formatPoints(25 - 20), "+5.0 pts");
  assert.equal(formatPoints(-4.5), "−4.5 pts");
  assert.equal(formatPoints(0.02), "0.0 pts");
  assert.equal(percentOf(1, 4), 25);
  assert.equal(percentOf(5, 0), 0);
});

test("counts agree with their noun", () => {
  assert.equal(count(1, "day"), "1 day");
  assert.equal(count(0, "day"), "0 days");
  assert.equal(count(3, "transaction"), "3 transactions");
  assert.equal(count(1200, "transaction"), "1,200 transactions");
  assert.equal(count(2, "category", "categories"), "2 categories");
  assert.equal(count(1, "category", "categories"), "1 category");
});
