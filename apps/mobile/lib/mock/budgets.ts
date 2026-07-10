import type { IBudget } from "@save-n-spend/types";
import { transactions } from "./transactions";

const MONTH = "2026-01";

// Per-category monthly LIMITS only (paise). `spent` is NOT stored — it's computed
// by aggregating transactions for the category/month (matches the real endpoint).
// Limits are tuned to the mock transactions so the screen shows a spread of states
// (shopping over, entertainment near-limit, rest healthy). Richer txn data would
// let these be larger/realistic.
export const budgets: IBudget[] = [
  { _id: "bud-food",          userId: "u1", category: "cat-food",          month: MONTH, limit: 60000 },  // 75%  ok
  { _id: "bud-shopping",      userId: "u1", category: "cat-shopping",      month: MONTH, limit: 250000 }, // 116% over
  { _id: "bud-transport",     userId: "u1", category: "cat-transport",     month: MONTH, limit: 100000 }, // 69%  ok
  { _id: "bud-entertainment", userId: "u1", category: "cat-entertainment", month: MONTH, limit: 75000 },  // 87%  warning
  { _id: "bud-bills",         userId: "u1", category: "cat-bills",         month: MONTH, limit: 200000 }, // 63%  ok
];

// Computed monthly-budget summary (a mock of the aggregate API response). Paise.
// Consistent with the data: total = sum of limits, spent = sum of expense txns.
export const monthlyBudget = {
  total: 685000,
  spent: 593300,
  daysLeft: 6,
  dailyLimit: 15283,
  status: "On Track",
};

// MOCK of GET /budgets?month=… — the real endpoint aggregates `spent` server-side.
// The client just consumes { budget, spent }; swap this for a fetch when the API lands.
export const budgetSummary = (): { budget: IBudget; spent: number }[] =>
  budgets.map((b) => ({
    budget: b,
    spent: transactions
      .filter((t) => t.type === "expense" && t.category === b.category)
      .reduce((sum, t) => sum + t.amount, 0),
  }));