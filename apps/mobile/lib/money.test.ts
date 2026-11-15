import { test } from "node:test";
import assert from "node:assert/strict";
import { fake } from "../test/node";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/money.test.ts

const settings = { privacyMode: false, peeking: false };
fake("@/store/settings", { useSettings: { getState: () => settings } });

const money = require("./money") as typeof import("./money");
const { milestoneCrossed } = require("./netWorthMilestone") as typeof import("./netWorthMilestone");

test("paise print as Indian-grouped rupees, paise only when there are some", () => {
  assert.equal(money.formatMoneyExact(5240000), "₹52,400");
  assert.equal(money.formatMoneyExact(125050), "₹1,250.50");
  assert.equal(money.formatMoneyExact(-45000), "-₹450");
  assert.equal(money.formatMoneyExact(0), "₹0");
  assert.equal(money.formatMoneyExact(1), "₹0.01");
  assert.equal(money.formatMoneyExact(99999), "₹999.99");
  assert.equal(money.formatMoneyExact(100000), "₹1,000");
  assert.equal(money.formatMoneyExact(10000000), "₹1,00,000");
  assert.equal(money.formatMoneyExact(1234567890), "₹1,23,45,678.90");
  assert.equal(money.formatMoneyExact(-1), "-₹0.01");
  // A derived figure with a fraction of a paisa is rounded, not truncated.
  assert.equal(money.formatMoneyExact(10.6), "₹0.11");
});

test("privacy mode masks every amount at one width; a peek shows them", () => {
  assert.equal(money.default(5240000), "₹52,400");
  settings.privacyMode = true;
  assert.equal(money.default(5240000), money.MASKED_MONEY);
  assert.equal(money.default(1), money.MASKED_MONEY);
  settings.peeking = true;
  assert.equal(money.default(5240000), "₹52,400");
  settings.privacyMode = false;
  settings.peeking = false;
  // Files the user asked for are never masked.
  settings.privacyMode = true;
  assert.equal(money.formatMoneyExact(5240000), "₹52,400");
  settings.privacyMode = false;
});

test("typed amounts become whole paise", () => {
  assert.equal(money.parseMoney("1,250.50"), 125050);
  assert.equal(money.parseMoney("₹ 52,400"), 5240000);
  assert.equal(money.parseMoney("19.99"), 1999);
  assert.equal(money.parseMoney("0.1"), 10);
  assert.equal(money.parseMoney("12"), 1200);
  assert.ok(Number.isNaN(money.parseMoney("")));
  assert.ok(Number.isNaN(money.parseMoney("abc")));
});

test("paise back into a field, and rounding to the rupee", () => {
  assert.equal(money.paiseToInput(5240000), "52400");
  assert.equal(money.paiseToInput(125050), "1250.50");
  assert.equal(money.paiseToInput(5), "0.05");
  assert.equal(money.parseMoney(money.paiseToInput(125050)), 125050);
  assert.equal(money.roundToRupee(149), 100);
  assert.equal(money.roundToRupee(150), 200);
  assert.equal(money.roundToRupee(12345), 12300);
});

/** Lakhs of rupees, in paise. */
const L = (lakhs: number) => Math.round(lakhs * 100_000 * 100);

test("net-worth milestones: upward crossings of a step that grows with net worth", () => {
  assert.equal(milestoneCrossed(L(8.6), L(9.1), 0), L(9));
  assert.equal(milestoneCrossed(L(8.1), L(8.6), 0), null);
  // Past ₹10L the step is ₹5L.
  assert.equal(milestoneCrossed(L(9.5), L(10.2), 0), L(10));
  assert.equal(milestoneCrossed(L(11), L(14), 0), null);
  assert.equal(milestoneCrossed(L(14), L(15.5), 0), L(15));
  // Past ₹50L it is ₹10L.
  assert.equal(milestoneCrossed(L(55), L(62), 0), L(60));
});

test("net-worth milestones: never twice, never on the way down", () => {
  assert.equal(milestoneCrossed(L(8.6), L(9.1), L(9)), null);
  assert.equal(milestoneCrossed(L(9.1), L(8.6), 0), null);
  assert.equal(milestoneCrossed(L(9), L(9), 0), null);
});
