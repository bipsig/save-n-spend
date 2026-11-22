import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCOUNT_TYPE_LABEL, accountSubline } from "./accountLabels";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/accountLabels.test.ts

test("one word per account type", () => {
  assert.equal(ACCOUNT_TYPE_LABEL.bank, "Bank account");
  assert.equal(ACCOUNT_TYPE_LABEL.credit_card, "Credit card");
});

test("Net worth names a person's direction, not 'Owes you' for everyone (row 36)", () => {
  assert.equal(accountSubline({ type: "person", balance: 50_000 }), "Owes you");
  assert.equal(accountSubline({ type: "person", balance: -50_000 }), "You owe");
  assert.equal(accountSubline({ type: "person", balance: 0 }), "Settled up");
  assert.equal(accountSubline({ type: "bank", balance: -100 }), "Bank account");
  assert.equal(accountSubline({ type: "investment", balance: 1 }), "Investment");
});
