import { test } from "node:test";
import assert from "node:assert/strict";
import { offlineData, offlinePath } from "./offlineSlot";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/offlineSlot.test.ts

test("Home's summary is saved under one path whatever `since` it was asked with", () => {
  const a = offlinePath("/dashboard/summary?since=2026-11-17T18%3A39%3A40.891Z");
  const b = offlinePath("/dashboard/summary?since=2026-11-17T18%3A41%3A00.210Z");
  assert.equal(a, "/dashboard/summary");
  assert.equal(b, a);
  assert.equal(offlinePath("/dashboard/summary"), "/dashboard/summary");
  // Any other parameter still keys its own copy.
  assert.equal(offlinePath("/dashboard/summary?since=x&month=2026-10"), "/dashboard/summary?month=2026-10");
});

test("every other path is saved as it is", () => {
  for (const p of ["/dashboard/insights", "/insights?period=day&offset=-3", "/transactions?since=x", "/auth/me", "/dashboard/summary-x?since=y"]) {
    assert.equal(offlinePath(p), p);
  }
});

test("the saved summary drops its since-last-opened digest, nothing else", () => {
  const summary = { income: 100, expenses: 50, sinceLastOpened: { transactions: 2, spent: 650, tripSpent: 400 } };
  assert.deepEqual(offlineData("/dashboard/summary?since=x", summary), { income: 100, expenses: 50 });
  assert.equal(summary.sinceLastOpened.transactions, 2); // the live answer on screen is untouched
  const plain = { income: 100 };
  assert.equal(offlineData("/dashboard/summary", plain), plain);
  // Another path keeps a field of the same name.
  const other = { sinceLastOpened: 1 };
  assert.equal(offlineData("/dashboard/insights", other), other);
  assert.equal(offlineData("/dashboard/summary", null), null);
});
