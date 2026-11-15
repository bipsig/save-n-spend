import { test } from "node:test";
import assert from "node:assert/strict";
import { createKeyHolder, holderFor, makeIdempotencyKey, stableStringify } from "./idempotency";

// Run from apps/api: node --require ts-node/register --test ../mobile/lib/idempotency.test.ts

const counter = () => {
  let n = 0;
  return () => `key-${++n}`;
};

test("keys are 26 characters, unique, and fit a transaction clientId", () => {
  const keys = new Set(Array.from({ length: 500 }, makeIdempotencyKey));
  assert.equal(keys.size, 500);
  for (const k of keys) assert.match(k, /^[0-9a-z]{26}$/);
});

test("stableStringify ignores key order", () => {
  assert.equal(stableStringify({ a: 1, b: { d: 2, c: [3, { f: 1, e: 2 }] } }), stableStringify({ b: { c: [3, { e: 2, f: 1 }], d: 2 }, a: 1 }));
  assert.notEqual(stableStringify({ a: 1 }), stableStringify({ a: 2 }));
  assert.equal(stableStringify(undefined), "");
});

test("the key made when the form opens is the one the first send uses", () => {
  const make = counter();
  const holder = createKeyHolder(make);
  assert.equal(holder.keyFor("POST", "/goals", { name: "Trip", target: 100 }), "key-1");
});

test("a double tap or a re-tap after an error reuses the key", () => {
  const holder = createKeyHolder(counter());
  const body = { amount: 50000 };
  const first = holder.keyFor("POST", "/goals/g1/contribute", body);
  assert.equal(holder.keyFor("POST", "/goals/g1/contribute", { amount: 50000 }), first);
  assert.equal(holder.keyFor("POST", "/goals/g1/contribute", body), first);
});

test("a changed value is a new intent with a new key", () => {
  const holder = createKeyHolder(counter());
  const a = holder.keyFor("POST", "/goals/g1/contribute", { amount: 50000 });
  const b = holder.keyFor("POST", "/goals/g1/contribute", { amount: 60000 });
  assert.notEqual(a, b);
  // Another route or method is another write, too.
  assert.notEqual(holder.keyFor("POST", "/bills/b1/skip"), holder.keyFor("POST", "/bills/b1/pay"));
  assert.notEqual(holder.keyFor("PATCH", "/x", {}), holder.keyFor("POST", "/x", {}));
});

test("success or a new open replaces every key", () => {
  const holder = createKeyHolder(counter());
  const before = holder.keyFor("POST", "/budgets", { limit: 1 });
  holder.reset();
  const after = holder.keyFor("POST", "/budgets", { limit: 1 });
  assert.notEqual(before, after);
  assert.equal(holder.keyFor("POST", "/budgets", { limit: 1 }), after);
});

test("a form that sends several writes keeps one key for each", () => {
  const holder = createKeyHolder(counter());
  const one = holder.keyFor("PATCH", "/accounts/a1/balance", { balance: 100 });
  const two = holder.keyFor("PATCH", "/accounts/a2/balance", { balance: 200 });
  // The second save after a partial failure sends both again with their own keys.
  assert.equal(holder.keyFor("PATCH", "/accounts/a1/balance", { balance: 100 }), one);
  assert.equal(holder.keyFor("PATCH", "/accounts/a2/balance", { balance: 200 }), two);
  assert.notEqual(one, two);
});

test("closing and reopening a sheet on the same target with the same values reuses the key", () => {
  const body = { amount: 50000 };
  const first = holderFor("goal:g1:contribute").keyFor("POST", "/goals/g1/contribute", body);
  // A reopen looks the holder up again; the screen behind it may even have remounted.
  assert.equal(holderFor("goal:g1:contribute").keyFor("POST", "/goals/g1/contribute", { amount: 50000 }), first);
  // Another target, or other values, is another intent.
  assert.notEqual(holderFor("goal:g2:contribute").keyFor("POST", "/goals/g2/contribute", body), first);
  assert.notEqual(holderFor("goal:g1:contribute").keyFor("POST", "/goals/g1/contribute", { amount: 1 }), first);
});

test("a success on one target leaves another target's key alone", () => {
  const billA = holderFor("bill:A").keyFor("POST", "/bills/A/pay");
  const billB = holderFor("bill:B").keyFor("POST", "/bills/B/pay");
  holderFor("bill:A").reset();
  assert.notEqual(holderFor("bill:A").keyFor("POST", "/bills/A/pay"), billA);
  assert.equal(holderFor("bill:B").keyFor("POST", "/bills/B/pay"), billB);
});
