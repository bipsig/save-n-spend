import { test } from "node:test";
import assert from "node:assert/strict";
import "../test/node";
import type { InsightsCategorySlice } from "@save-n-spend/types";
import { formatPct } from "./format/pct";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/everydaySpend.test.ts

const e = require("./everydaySpend") as typeof import("./everydaySpend");

// Mockup 08: November, everyday ₹79,640.20 plus ₹6,450.00 on trips; October ₹83,960.94, no trips.
const NOV = { income: 12000000, expense: 8609020, tripExpense: 645000 };
const OCT = { income: 12000000, expense: 8396094, tripExpense: 0 };

test("trips line: only a positive amount the API sent", () => {
  assert.equal(e.tripLine(645000), 645000);
  assert.equal(e.tripLine(0), null);
  assert.equal(e.tripLine(undefined), null);
  assert.equal(e.tripLine(null), null);
});

test("Home: everyday tile, sparkline and week pulse", () => {
  const s = e.homeSpend({
    expenses: 8609020, tripExpenses: 645000, weekExpense: 27345, weekTripExpense: 15000,
    flowTrend: [{ expense: 9503270, tripExpense: 1107176 }, { expense: 8609020, tripExpense: 645000 }],
  });
  assert.equal(s.expenses, 7964020);
  assert.equal(s.trips, 645000);
  assert.deepEqual(s.trend, [8396094, 7964020]);
  assert.equal(s.weekExpense, 12345);
});

test("Home on a 2.8.1 response: every figure as sent, no trips line", () => {
  const s = e.homeSpend({ expenses: 7240828, weekExpense: 500, flowTrend: [{ expense: 9503270 }, { expense: 7240828 }] });
  assert.equal(s.expenses, 7240828);
  assert.equal(s.trips, null);
  assert.deepEqual(s.trend, [9503270, 7240828]);
  assert.equal(s.weekExpense, 500);
});

test("Insights: hero and change are everyday against everyday", () => {
  const s = e.insightsSpend([OCT, NOV]);
  assert.equal(s.current, 7964020);
  assert.equal(formatPct(s.deltaPct, { kind: "change" }), "−5.1%");
  assert.equal(s.trips, 645000);
  assert.equal(s.withTrips, 8609020);
  assert.deepEqual(s.columns, [{ income: 12000000, expense: 8396094 }, { income: 12000000, expense: 7964020 }]);
});

test("Insights: a window without trips has no line and no 'with trips' centre", () => {
  const s = e.insightsSpend([NOV, OCT]);
  assert.equal(s.trips, null);
  assert.equal(s.withTrips, null);
  assert.equal(s.current, 8396094);
  // The trip month before it compares by its everyday part.
  assert.equal(formatPct(s.deltaPct, { kind: "change" }), "+5.4%");
});

test("Insights on a 2.8.1 series: the 2.8.3 figures (trips counted, as the old API sends them)", () => {
  const s = e.insightsSpend([{ income: 100, expense: 9503270 }, { income: 100, expense: 7240828 }]);
  assert.equal(s.current, 7240828);
  assert.equal(s.deltaPct, ((7240828 - 9503270) / 9503270) * 100);
  assert.equal(s.trips, null);
  assert.equal(s.withTrips, null);
  assert.deepEqual(s.columns.map((c) => c.expense), [9503270, 7240828]);
});

test("Insights with nothing in the series", () => {
  const s = e.insightsSpend([]);
  assert.equal(s.current, 0);
  assert.equal(s.deltaPct, 0);
  assert.equal(s.trips, null);
});

const slice = (categoryId: string, total: number, share?: number): InsightsCategorySlice =>
  ({ categoryId, name: categoryId, total, ...(share === undefined ? {} : { share }) });

test("By category: the server's shares, Trips only in the ring, list adds to 100.0", () => {
  const out = e.categoryShares(
    [slice("rent", 2800000, 35.2), slice("food", 1824060, 22.9), slice("shop", 1290580, 16.2),
      slice("bills", 1204000, 15.1), slice("transport", 845380, 10.6), slice("trips", 645000)],
    { total: 0, share: 0 },
  )!;
  assert.deepEqual(out.list.map((s) => [s.id, s.pct]), [["rent", 35.2], ["food", 22.9], ["shop", 16.2], ["bills", 15.1], ["transport", 10.6]]);
  assert.equal(Math.round(out.list.reduce((a, s) => a + (s.pct ?? 0), 0) * 10) / 10, 100);
  assert.deepEqual(out.ring.map((s) => s.id), ["rent", "food", "shop", "bills", "transport", "trips"]);
  const trips = out.ring[5];
  assert.equal(trips.pct, null);
  assert.equal(trips.color, "#767489");
});

test("By category: Others sums its shares, Uncategorised closes the list but stays out of the ring", () => {
  // API test case: a ₹20 uncategorised bill beside 43.3 / 33.3 / 16.7.
  const out = e.categoryShares([slice("a", 650, 43.3), slice("b", 500, 33.3), slice("c", 250, 16.7), slice("trips", 900)], { total: 100, share: 6.7 }, 2)!;
  assert.deepEqual(out.list.map((s) => [s.id, s.pct]), [["a", 43.3], ["b", 33.3], ["others", 16.7], ["uncategorised", 6.7]]);
  assert.equal(Math.round(out.list.reduce((a, s) => a + (s.pct ?? 0), 0) * 10) / 10, 100);
  assert.deepEqual(out.ring.map((s) => s.id), ["a", "b", "others", "trips"]);
  assert.equal(out.list.find((s) => s.id === "others")!.total, 250);
});

test("By category: Others' sum is kept to one decimal", () => {
  const out = e.categoryShares([slice("a", 1, 70), slice("b", 1, 10.1), slice("c", 1, 10.2), slice("d", 1, 9.7)], { total: 0, share: 0 }, 1)!;
  assert.equal(out.list[1].pct, 30);
});

test("By category on a 2.8.1 response: null, so the screen keeps foldCategories", () => {
  assert.equal(e.categoryShares([slice("rent", 2800000), slice("trips", 645000)], undefined), null);
});

test("Review: everyday tile and change, trips line, shares with Trips by amount and Uncategorised", () => {
  const r = e.reviewSpend({
    expenses: 9503270, tripExpenses: 1107176, previousExpenses: 7318437, previousTripExpenses: 0,
    categories: [
      { categoryId: "bills", name: "Bills & Utilities", total: 3326000, pct: 35, share: 39.6 },
      { categoryId: "trips", name: "Trips", total: 1107176, pct: 12 },
      { categoryId: "food", name: "Food & Dining", total: 1041000, pct: 11, share: 12.4 },
    ],
    uncategorised: { total: 32000, share: 17.3 },
  });
  assert.equal(r.expenses, 8396094);
  assert.equal(r.previousExpenses, 7318437);
  assert.equal(r.trips, 1107176);
  assert.deepEqual(r.rows.map((x) => [x.id, x.pct]), [["bills", 39.6], ["trips", null], ["food", 12.4], ["uncategorised", 17.3]]);
});

test("Review: no uncategorised row when there is none", () => {
  const r = e.reviewSpend({ expenses: 10, previousExpenses: 10, tripExpenses: 0, previousTripExpenses: 0, categories: [], uncategorised: { total: 0, share: 0 } });
  assert.deepEqual(r.rows, []);
  assert.equal(r.trips, null);
});

test("Review on a 2.8.1 response: the old whole-number pct, trips counted, no line", () => {
  const r = e.reviewSpend({
    expenses: 9503270, previousExpenses: 7318437,
    categories: [{ categoryId: "bills", name: "Bills", total: 3326000, pct: 35 }, { categoryId: "trips", name: "Trips", total: 1107176, pct: 12 }],
  });
  assert.equal(r.expenses, 9503270);
  assert.equal(r.previousExpenses, 7318437);
  assert.equal(r.trips, null);
  assert.deepEqual(r.rows.map((x) => [x.id, x.pct]), [["bills", 35], ["trips", 12]]);
});

test("Category insights: everyday share when sent, else all spending", () => {
  assert.deepEqual(e.categoryShare({ shareOfSpend: 26.86, shareOfEverydaySpend: 28.37 }), { pct: 28.37, of: "everyday spending" });
  assert.deepEqual(e.categoryShare({ shareOfSpend: 26.86 }), { pct: 26.86, of: "all spending" });
});

const rent = { title: "Rent", amount: 2800000, occurredAt: "2026-11-02T06:30:00.000Z" };
const stay = { title: "Beach stay", amount: 645000, occurredAt: "2026-11-16T06:30:00.000Z" };

test("biggest expense: the everyday one, null kept, 2.8.1 falls back", () => {
  assert.equal(e.biggestEveryday({ biggestExpense: stay, biggestEverydayExpense: rent }), rent);
  assert.equal(e.biggestEveryday({ biggestExpense: stay, biggestEverydayExpense: null }), null);
  assert.equal(e.biggestEveryday({ biggestExpense: stay }), stay);
});

test("since last opened: everyday spent and the trips line", () => {
  assert.deepEqual(e.sinceSpend({ spent: 27345, tripSpent: 15000 }), { spent: 12345, trips: 15000 });
  assert.deepEqual(e.sinceSpend({ spent: 27345, tripSpent: 0 }), { spent: 27345, trips: null });
  assert.deepEqual(e.sinceSpend({ spent: 27345 }), { spent: 27345, trips: null });
});

const heat = [{ day: "Fri", total: 45000, intensity: 1 }];
const pace = { current: [{ date: "2026-04-10", amount: 45000 }], average: [], monthsAveraged: 3 };
const forYou = { goalWatch: null, noSpendDays: 12, weekdayHeatmap: heat };

test("dashboard insights: the everyday block, its own nulls, 2.8.1 falls back to forYou", () => {
  const everydayBlock = { noSpendDays: 13, weekdayHeatmap: null, pace: null };
  assert.equal(e.dashboardEveryday({ forYou, pace, everyday: everydayBlock }), everydayBlock);
  assert.deepEqual(e.dashboardEveryday({ forYou, pace }), { noSpendDays: 12, weekdayHeatmap: heat, pace });
});

test("insights trend: trip part out of each bucket; 2.8.1 buckets as sent", () => {
  assert.deepEqual(
    e.everydayTrend([{ date: "2026-04-09", amount: 40000, tripAmount: 40000 }, { date: "2026-04-10", amount: 1500, tripAmount: 0 }]),
    [{ date: "2026-04-09", amount: 0 }, { date: "2026-04-10", amount: 1500 }],
  );
  assert.deepEqual(e.everydayTrend([{ date: "2026-04-09", amount: 40000 }]), [{ date: "2026-04-09", amount: 40000 }]);
});

test("insights daily averages: everyday when sent, else the 2.8.1 ones", () => {
  assert.deepEqual(
    e.dailyAverages({ avgDailySpendCurrent: 50133, avgDailySpendPrevious: 1, avgDailyEverydaySpendCurrent: 47467, avgDailyEverydaySpendPrevious: 2 }),
    { current: 47467, previous: 2 },
  );
  assert.deepEqual(e.dailyAverages({ avgDailySpendCurrent: 50133, avgDailySpendPrevious: 1 }), { current: 50133, previous: 1 });
});
