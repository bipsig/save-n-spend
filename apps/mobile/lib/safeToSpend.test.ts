import { test } from "node:test";
import assert from "node:assert/strict";
import type { IBill } from "@save-n-spend/types";
import { billsAgainstBudgets } from "./safeToSpend";

// Run from apps/api: node --require ts-node/register --test ../mobile/lib/safeToSpend.test.ts

const IST = "Asia/Kolkata";
const monthIn = (zone: string) => (iso: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit" }).formatToParts(new Date(iso));
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
};
const monthOf = monthIn(IST);

let n = 0;
const bill = (over: Partial<IBill>): IBill => ({
  _id: `b${++n}`, userId: "u", name: "Bill", amount: 1_000_00, category: "food",
  dueDate: "2026-10-15T06:30:00.000Z", status: "pending", recurring: true, frequency: "monthly",
  ...over,
});

const categories = [
  { _id: "food", parent: null },
  { _id: "groceries", parent: "food" },
  { _id: "dining", parent: "food" },
  { _id: "housing", parent: null },
  { _id: "rent", parent: "housing" },
];
const foodBudget = [{ category: "food" }];
const total = (bills: IBill[], budgets = foodBudget, month = "2026-10", cats = categories) =>
  billsAgainstBudgets(bills, budgets, cats, month, monthOf).total;

test("the prod case: a Food budget, unbudgeted rent and three SIPs owes nothing", () => {
  const bills = [
    bill({ name: "Flat Rent", amount: 20_000_00, category: "rent", dueDate: "2026-10-02T06:30:00Z" }),
    bill({ name: "PPF", amount: 10_000_00, category: null, toInvestment: "ppf", dueDate: "2026-10-04T06:30:00Z" }),
    bill({ name: "ICICI MF", amount: 5_000_00, category: null, toInvestment: "icici", dueDate: "2026-10-09T06:30:00Z" }),
    bill({ name: "Franklin", amount: 10_000_00, category: null, toInvestment: "ft", dueDate: "2026-10-16T06:30:00Z" }),
  ];
  assert.equal(total(bills), 0);
});

test("a bill in the budgeted category counts", () => {
  assert.equal(total([bill({ amount: 650_00 })]), 650_00);
});

test("a SIP never counts, even when it carries a budgeted category", () => {
  assert.equal(total([bill({ toInvestment: "sip1" })]), 0);
});

test("an explicit null toInvestment is an ordinary bill", () => {
  assert.equal(total([bill({ toInvestment: null })]), 1_000_00);
});

test("a bill in a child of a budgeted parent counts — budgets roll children in", () => {
  assert.equal(total([bill({ category: "groceries" })]), 1_000_00);
});

test("a bill in the parent doesn't count against a budget on one child", () => {
  assert.equal(total([bill({ category: "food" })], [{ category: "groceries" }]), 0);
});

test("parent and child both budgeted: the child's bill counts once", () => {
  assert.equal(total([bill({ category: "groceries" })], [{ category: "food" }, { category: "groceries" }]), 1_000_00);
});

test("a bill with no category counts against no budget", () => {
  assert.equal(total([bill({ category: null })]), 0);
});

test("a bill whose category is gone still counts if that id is budgeted, else not", () => {
  assert.equal(total([bill({ category: "deleted" })], [{ category: "deleted" }]), 1_000_00);
  assert.equal(total([bill({ category: "deleted" })]), 0);
});

test("paid bills don't count", () => {
  assert.equal(total([bill({ status: "paid", recurring: false })]), 0);
});

test("an overdue bill from last month still counts against this month", () => {
  assert.equal(total([bill({ status: "overdue", dueDate: "2026-09-20T06:30:00Z" })]), 1_000_00);
});

test("next month's bill doesn't touch this month", () => {
  assert.equal(total([bill({ dueDate: "2026-11-02T06:30:00Z" })]), 0);
});

test("the month is read in the user's zone: 31 Oct 19:00 UTC is already November in India", () => {
  const lateOct = bill({ dueDate: "2026-10-31T19:00:00Z" });
  assert.equal(total([lateOct]), 0);
  assert.equal(billsAgainstBudgets([lateOct], foodBudget, categories, "2026-10", monthIn("UTC")).total, 1_000_00);
});

test("a yearly bill counts in its month and not before", () => {
  const insurance = bill({ frequency: "yearly", dueDate: "2027-03-10T06:30:00Z" });
  assert.equal(total([insurance]), 0);
  assert.equal(total([insurance], foodBudget, "2027-03"), 1_000_00);
});

test("no budgets, nothing owed against them", () => {
  assert.equal(total([bill({})], []), 0);
});

test("only the counted bills are returned, in order", () => {
  const counted = bill({ name: "Groceries box", category: "groceries" });
  const res = billsAgainstBudgets(
    [bill({ category: "rent" }), counted, bill({ toInvestment: "x" })],
    foodBudget, categories, "2026-10", monthOf,
  );
  assert.deepEqual(res.bills.map((b) => b.name), ["Groceries box"]);
});
