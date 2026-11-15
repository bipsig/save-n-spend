import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuery, feedFilters, summaryPath } from "./transactionQuery";

const RANGE = { startDate: "2026-11-01", endDate: "2026-11-30" };

test("with no filters the card asks for exactly what 2.8.0 did, so its offline cache still answers", () => {
  assert.equal(summaryPath(RANGE), "/transactions/summary?startDate=2026-11-01&endDate=2026-11-30&trips=exclude");
  assert.equal(summaryPath({}), "/transactions/summary?trips=exclude");
  assert.equal(summaryPath({ ...RANGE, category: [], account: [], search: "" }), summaryPath(RANGE));
});

test("every list filter reaches the card's request", () => {
  const path = summaryPath({ ...RANGE, category: ["c1", "c2"], account: ["a1"], type: "expense", search: "big basket" });
  assert.equal(path, "/transactions/summary?startDate=2026-11-01&endDate=2026-11-30&category=c1%2Cc2&account=a1&type=expense&search=big%20basket&trips=exclude");
});

test("the card and the list send the same filters", () => {
  const params = { ...RANGE, category: ["c1"], account: ["a1", "a2"], type: "income" as const, search: "rent" };
  assert.equal(summaryPath(params), `/transactions/summary${buildQuery(feedFilters(params))}`);
  const list = new URLSearchParams(buildQuery({ page: 1, limit: 20, ...feedFilters(params) }));
  const card = new URLSearchParams(summaryPath(params).split("?")[1]);
  list.delete("page");
  list.delete("limit");
  assert.deepEqual([...card.entries()], [...list.entries()]);
});

test("each filter change is a different request and a different cache entry", () => {
  const variants = [
    RANGE,
    { ...RANGE, category: ["c1"] },
    { ...RANGE, category: ["c1", "c2"] },
    { ...RANGE, account: ["a1"] },
    { ...RANGE, type: "expense" as const },
    { ...RANGE, type: "transfer" as const },
    { ...RANGE, search: "a" },
    { ...RANGE, search: "ab" },
    { startDate: "2026-10-01", endDate: "2026-10-31" },
  ];
  assert.equal(new Set(variants.map(summaryPath)).size, variants.length);
});
