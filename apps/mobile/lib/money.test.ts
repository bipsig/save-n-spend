import { test } from "node:test";
import assert from "node:assert/strict";
import { fake } from "../test/node";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/money.test.ts

const settings = { privacyMode: false, peeking: false };
fake("@/store/settings", { useSettings: { getState: () => settings } });

const money = require("./money") as typeof import("./money");
const { milestoneCrossed } = require("./netWorthMilestone") as typeof import("./netWorthMilestone");

test("paise print as exact Indian-grouped rupees, always two decimals, with a true minus", () => {
  assert.equal(money.formatMoneyExact(5240000), "₹52,400.00");
  assert.equal(money.formatMoneyExact(125050), "₹1,250.50");
  assert.equal(money.formatMoneyExact(-45000), "−₹450.00");
  assert.equal(money.formatMoneyExact(0), "₹0.00");
  assert.equal(money.formatMoneyExact(1), "₹0.01");
  assert.equal(money.formatMoneyExact(99999), "₹999.99");
  assert.equal(money.formatMoneyExact(100000), "₹1,000.00");
  assert.equal(money.formatMoneyExact(10000000), "₹1,00,000.00");
  assert.equal(money.formatMoneyExact(1234567890), "₹1,23,45,678.90");
  assert.equal(money.formatMoneyExact(-1), "−₹0.01");
  // A derived figure with a fraction of a paisa is rounded, not truncated.
  assert.equal(money.formatMoneyExact(10.6), "₹0.11");
  // A figure that rounds to zero has no sign.
  assert.equal(money.formatMoneyExact(-0.4), "₹0.00");
  assert.equal(money.formatMoneyExact(-0.4, { sign: "always" }), "₹0.00");
});

test("sign options: always for rows and changes, none where the label names the direction", () => {
  assert.equal(money.formatMoneyExact(12000000, { sign: "always" }), "+₹1,20,000.00");
  assert.equal(money.formatMoneyExact(-48650, { sign: "always" }), "−₹486.50");
  assert.equal(money.formatMoneyExact(0, { sign: "always" }), "₹0.00");
  assert.equal(money.formatMoneyExact(-48650, { sign: "none" }), "₹486.50");
  assert.equal(money.formatMoneyExact(48650, { sign: "auto" }), "₹486.50");
});

test("balances and budgets in words (D11 A)", () => {
  assert.equal(money.formatBalance(-1200000, "credit_card"), "₹12,000.00 owed");
  assert.equal(money.formatBalance(-300000, "bank"), "₹3,000.00 overdrawn");
  assert.equal(money.formatBalance(4500000, "bank"), "₹45,000.00 available");
  assert.equal(money.formatBalance(0, "credit_card"), "₹0.00 available");
  assert.equal(money.formatBalance(50000, "person"), "Owes you ₹500.00");
  assert.equal(money.formatBalance(-50000, "person"), "You owe ₹500.00");
  assert.equal(money.formatBalance(0.3, "person"), "Settled up");
  assert.equal(money.formatBalance(11200000, "investment"), "₹1,12,000.00");
  assert.equal(money.formatRemaining(-50000), "₹500.00 over");
  assert.equal(money.formatRemaining(200000), "₹2,000.00 left");
  assert.equal(money.formatRemaining(0), "₹0.00 left");
});

test("privacy mode masks every amount at one width; a peek shows them", () => {
  assert.equal(money.default(5240000), "₹52,400.00");
  settings.privacyMode = true;
  assert.equal(money.default(5240000), money.MASKED_MONEY);
  assert.equal(money.default(1), money.MASKED_MONEY);
  // Unchanged from before: with no sign asked for, a negative masks to the same dots.
  assert.equal(money.default(-45000), money.MASKED_MONEY);
  // A sign the caller asked for stays, as Money's prefix always did.
  assert.equal(money.default(-45000, { sign: "always" }), "−₹ ••••");
  assert.equal(money.default(45000, { sign: "always" }), "+₹ ••••");
  assert.equal(money.default(0, { sign: "always" }), money.MASKED_MONEY);
  assert.equal(money.formatBalance(-1200000, "credit_card"), "₹ •••• owed");
  settings.peeking = true;
  assert.equal(money.default(5240000), "₹52,400.00");
  settings.privacyMode = false;
  settings.peeking = false;
  // Files the user asked for are never masked.
  settings.privacyMode = true;
  assert.equal(money.formatMoneyExact(5240000), "₹52,400.00");
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

test("paise back into a field", () => {
  assert.equal(money.paiseToInput(5240000), "52400");
  assert.equal(money.paiseToInput(125050), "1250.50");
  assert.equal(money.paiseToInput(5), "0.05");
  assert.equal(money.parseMoney(money.paiseToInput(125050)), 125050);
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
