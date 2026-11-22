import { test } from "node:test";
import assert from "node:assert/strict";
import type { TripDetailPayload } from "@save-n-spend/types";
import { fake } from "../test/node";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/tripPending.test.ts

fake("@/store/pendingDeletes", { usePendingDeletes: () => new Set() });
const { tripWhilePending } = require("./tripPending") as typeof import("./tripPending");

const data = {
  trip: { _id: "t1" },
  expenses: [{ _id: "e1" }, { _id: "e2" }],
  entries: [
    { kind: "expense", id: "e1", amount: 100 },
    { kind: "expense", id: "e2", amount: 200 },
    { kind: "settlement", id: "e1", amount: 50 },
  ],
  members: [{ account: "p1", balance: 300, exact: 250, routed: 50 }],
  plan: { savedAt: "x", stale: false, entries: [{ account: "p1", amount: 300 }] },
  totals: { myShare: 300 },
} as unknown as TripDetailPayload;

test("nothing pending: the same object", () => {
  assert.equal(tripWhilePending(data, new Set()), data);
  assert.equal(tripWhilePending(data, new Set(["tripExpense:other"])), data);
});

test("a pending trip expense leaves the journal; totals stay until it is sent", () => {
  const out = tripWhilePending(data, new Set(["tripExpense:e1"]));
  assert.deepEqual(out.expenses.map((e) => e._id), ["e2"]);
  assert.deepEqual(out.entries.map((e) => [e.kind, e.id]), [["expense", "e2"], ["settlement", "e1"]]);
  assert.equal(out.totals, data.totals);
  assert.equal(out.plan, data.plan);
});

test("a pending 'Back to exact amounts' shows the exact balances and no plan", () => {
  const out = tripWhilePending(data, new Set(["plan:t1"]));
  assert.equal(out.plan, null);
  assert.deepEqual(out.members.map((m) => [m.balance, m.routed]), [[250, 0]]);
  assert.equal(out.expenses.length, 2);
});
