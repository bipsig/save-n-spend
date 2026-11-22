import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accountFormSchema, categoryFormSchema, fieldProblems, rupeesToPaise, settleFormSchema, tripExpenseFormSchema, tripFormSchema,
} from "./formSchemas";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/formSchemas.test.ts

const money = (p: number) => `₹${(p / 100).toFixed(2)}`;

test("rupeesToPaise: blank is zero, typos and negatives are refused", () => {
  assert.equal(rupeesToPaise(""), 0);
  assert.equal(rupeesToPaise(" 12.5 "), 1250);
  assert.equal(rupeesToPaise("12,000"), null);
  assert.equal(rupeesToPaise("-5"), null);
});

test("category: a name is needed", () => {
  assert.deepEqual(fieldProblems(categoryFormSchema, { name: "  " }), { name: "Give the category a name" });
  assert.deepEqual(fieldProblems(categoryFormSchema, { name: "Pets" }), {});
});

test("trip: every problem at once, each on its own field", () => {
  const d = (n: number) => new Date(Date.UTC(2026, 10, n));
  assert.deepEqual(fieldProblems(tripFormSchema, { name: "", start: d(10), end: d(9) }), {
    name: "Give the trip a name.",
    end: "The trip can't end before it starts.",
  });
  assert.deepEqual(fieldProblems(tripFormSchema, { name: "Goa", start: d(10), end: d(10) }), {});
});

test("trip expense: amount, name, split and payer, all at once", () => {
  const schema = tripExpenseFormSchema(money);
  assert.deepEqual(fieldProblems(schema, { title: " ", cost: 0, shares: [], paidByMe: true, paidFrom: null }), {
    title: "Give it a name.",
    cost: "Enter the amount.",
    shares: "Tick who it's split between.",
    paidFrom: "Pick the account you paid from.",
  });
  assert.deepEqual(fieldProblems(schema, { title: "Dinner", cost: 300_000, shares: [{ amount: 100_000 }, { amount: 140_000 }], paidByMe: false, paidFrom: null }), {
    shares: "The shares add up to ₹2400.00 — they need to make ₹3000.00.",
  });
  assert.deepEqual(fieldProblems(schema, { title: "Dinner", cost: 300_000, shares: [{ amount: 150_000 }, { amount: 150_000 }], paidByMe: true, paidFrom: "a1" }), {});
});

test("settle: an amount and an account", () => {
  assert.deepEqual(fieldProblems(settleFormSchema, { amount: Number.NaN, account: null }), { amount: "Enter the amount.", account: "Pick the account." });
  assert.deepEqual(fieldProblems(settleFormSchema, { amount: 500, account: "a1" }), {});
});

test("account: name and every amount field checked together", () => {
  const blank = { name: "HDFC", opening: "", actual: "", isInvestment: false, worth: "", invested: "" };
  assert.deepEqual(fieldProblems(accountFormSchema, blank), {});
  assert.deepEqual(fieldProblems(accountFormSchema, { ...blank, name: "", opening: "abc", actual: "-1" }), {
    name: "Give the account a name",
    opening: "Enter the opening balance as a number, or leave it blank for zero.",
    actual: "Enter the balance as a number, or leave it blank to keep the one you have.",
  });
  assert.deepEqual(fieldProblems(accountFormSchema, { ...blank, worth: "x", invested: "y" }), {});
  assert.deepEqual(fieldProblems(accountFormSchema, { ...blank, isInvestment: true, worth: "x", invested: "1" }), { worth: "Enter amounts as numbers, or leave them blank." });
});
