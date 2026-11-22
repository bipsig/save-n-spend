import { test } from "node:test";
import assert from "node:assert/strict";
import "../test/node";
import type { InsightsCategorySlice } from "@save-n-spend/types";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/everydaySpend.test.ts

const e = require("./everydaySpend") as typeof import("./everydaySpend");
const { tripsColor } = require("../theme/charts") as typeof import("../theme/charts");

// October 2026 with Udupi closed 21 Oct (trips=entries): every total already holds Trips.
const SEP = { income: 19608900, expense: 7318437 };
const OCT = { income: 19584077, expense: 9503270 };

test("Insights: hero and change include Trips, as the server sends them", () => {
  const s = e.insightsSpend([SEP, OCT]);
  assert.equal(s.current, 9503270);
  assert.equal(Math.round(s.deltaPct * 10) / 10, 29.9);
  assert.deepEqual(s.columns[1], { income: 19584077, expense: 9503270 });
  assert.deepEqual(e.insightsSpend([]), { current: 0, deltaPct: 0, columns: [] });
});

const slice = (categoryId: string, name: string, total: number, share: number): InsightsCategorySlice => ({ categoryId, name, total, share });
const OCT_SLICES = [
  slice("bills", "Bills & Utilities", 3325000, 35.0),
  slice("shop", "Shopping", 1735043, 18.2),
  slice("move", "Transportation", 1488605, 15.7),
  { ...slice("trips", "Trips", 1107176, 11.6), children: [{ categoryId: "t1", name: "Udupi", total: 1107176, closedOn: "2026-10-21" }] },
  slice("food", "Food & Dining", 1042209, 11.0),
  slice("gifts", "Gifts", 805237, 8.5),
];

test("By category: Trips ranked by size in its own teal, the list adds to 100.0", () => {
  const s = e.categoryShares(OCT_SLICES, { total: 0, share: 0 }, 6)!;
  assert.deepEqual(s.list.map((c) => [c.name, c.pct]), [["Bills & Utilities", 35], ["Shopping", 18.2], ["Transportation", 15.7], ["Trips", 11.6], ["Food & Dining", 11], ["Gifts", 8.5]]);
  assert.equal(Math.round(s.list.reduce((a, c) => a + c.pct, 0) * 10) / 10, 100);
  const trips = s.list.find((c) => c.id === "trips")!;
  assert.equal(trips.color, tripsColor);
  assert.equal(trips.children?.[0].closedOn, "2026-10-21");
  // The palette skips Trips, so Food takes the fourth colour, not the fifth.
  assert.notEqual(s.list[4].color, s.list[5].color);
  assert.deepEqual(s.ring.map((c) => c.id), s.list.map((c) => c.id));
});

test("By category: the top five then Others; Uncategorised closes the list, not the ring", () => {
  const s = e.categoryShares(OCT_SLICES, { total: 10_000, share: 0.1 })!;
  assert.deepEqual(s.list.map((c) => c.name), ["Bills & Utilities", "Shopping", "Transportation", "Trips", "Food & Dining", "Others", "Uncategorised"]);
  assert.equal(s.list[5].pct, 8.5);
  assert.equal(s.ring.some((c) => c.id === e.UNCATEGORISED_ID), false);
  assert.equal(e.categoryShares(OCT_SLICES, undefined), null);
});

test("Review rows: shares with Trips ranked, older API's pct, uncategorised last", () => {
  const rows = e.reviewRows({
    categories: [
      { categoryId: "bills", name: "Bills & Utilities", total: 3325000, pct: 35, share: 35.0 },
      { categoryId: "trips", name: "Trips", total: 1107176, pct: 12, share: 11.6 },
    ],
    uncategorised: { total: 5000, share: 0.1 },
  });
  assert.deepEqual(rows.map((r) => [r.name, r.pct]), [["Bills & Utilities", 35], ["Trips", 11.6], ["Uncategorised", 0.1]]);
  assert.deepEqual(e.reviewRows({ categories: [{ categoryId: "x", name: "X", total: 1, pct: 40 }] }).map((r) => r.pct), [40]);
  assert.equal(e.isTrips("trips"), true);
});
