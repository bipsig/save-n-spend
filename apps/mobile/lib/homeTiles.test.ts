import { test } from "node:test";
import assert from "node:assert/strict";
import { fake } from "../test/node";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/homeTiles.test.ts

fake("@/store/session", { useSession: { getState: () => ({ user: { prefs: { timeZone: "Asia/Kolkata" } } }) } });
const h = require("./homeTiles") as typeof import("./homeTiles");

const rs = (p: number) => `${p < 0 ? "−" : "+"}₹${(Math.abs(p) / 100).toFixed(2)}`;
const ctx = { signedMoney: rs, masked: false };

// The dev copy on 22 Nov 2026, Udupi as stored (closed 12 Nov), records from 1 Sept.
const NOV = {
  income: 0, expenses: 11573177, savings: -11573177, netWorth: 55717294,
  previous: { income: 19584077, expenses: 8396094, tripExpenses: 0, savings: 11187983 },
  netWorthAtStart: 71530553,
};

test("Month: changes against the whole of October; no Income line before any income", () => {
  const t = h.homeTiles(NOV, { ...ctx, period: "month", startDay: "2026-11-01", firstDay: "2026-09-01" });
  assert.equal(t.scope, "November 2026 so far");
  assert.equal(t.income, null);
  assert.deepEqual(t.expenses, { text: "+37.8% vs Oct", tone: "danger" });
  assert.deepEqual(t.savings, { text: "No income yet", tone: "inkDim" });
  assert.deepEqual(t.netWorth, { text: "−₹158132.59 since 1 Nov", tone: "danger" });
  assert.equal(t.savingsLabel, "Savings");
});

test("Month with income: the rate, an Income change, January compares with December", () => {
  const t = h.homeTiles({ ...NOV, income: 19584077, savings: 19584077 - 11573177 }, { ...ctx, period: "month", startDay: "2027-01-01", firstDay: "2026-09-01" });
  assert.equal(t.scope, "January 2027 so far");
  assert.deepEqual(t.income, { text: "0.0% vs Dec", tone: "inkDim" });
  assert.equal(t.savings?.text, "40.9% saved");
});

test("Year and All time: no comparison before the records start; Saved; masked net worth uncoloured", () => {
  const year = h.homeTiles({ ...NOV, income: 39192977, expenses: 27287708, savings: 11905269, previous: null, netWorthAtStart: null }, { ...ctx, period: "year", startDay: "2026-01-01", firstDay: "2026-09-01" });
  assert.equal(year.scope, "2026 so far · your records start 1 Sep");
  assert.deepEqual([year.income, year.expenses, year.netWorth], [null, null, null]);
  assert.equal(year.savings?.text, "30.4% saved");
  const all = h.homeTiles({ ...NOV, previous: null }, { ...ctx, period: "all", startDay: null, firstDay: "2026-09-01" });
  assert.equal(all.scope, "Since 1 Sep 2026, your first record");
  assert.equal(all.savingsLabel, "Saved");
  assert.equal(all.netWorth, null);
  const masked = h.homeTiles(NOV, { signedMoney: () => "₹ ••••", masked: true, period: "month", startDay: "2026-11-01", firstDay: "2026-09-01" });
  assert.deepEqual(masked.netWorth, { text: "₹ •••• since 1 Nov", tone: "inkDim" });
});

test("one size for all four tiles, and where taps go", () => {
  assert.equal(h.tileSize(["₹0.00", "₹1,04,660.01", "₹5,57,172.94"]), "md");
  assert.equal(h.tileSize(["₹0.00", "₹4,660.01", "₹ ••••"]), "lg");
  assert.deepEqual(h.tileTargets("all"), { activityRange: "all", insightsPeriod: "year" });
  assert.deepEqual(h.tileTargets("month"), { activityRange: "month", insightsPeriod: "month" });
});
