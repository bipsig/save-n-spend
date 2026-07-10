import type { IBudget } from "@save-n-spend/types";

const MONTH = "2026-01";

// Per-category monthly LIMITS only (paise). `spent` is NOT stored — it's computed
// by aggregating transactions for the category/month (matches the real endpoint).
export const budgets: IBudget[] = [
  { _id: "bud-food",          userId: "u1", category: "cat-food",          month: MONTH, limit: 600000 },
  { _id: "bud-shopping",      userId: "u1", category: "cat-shopping",      month: MONTH, limit: 700000 },
  { _id: "bud-transport",     userId: "u1", category: "cat-transport",     month: MONTH, limit: 300000 },
  { _id: "bud-entertainment", userId: "u1", category: "cat-entertainment", month: MONTH, limit: 350000 },
  { _id: "bud-bills",         userId: "u1", category: "cat-bills",         month: MONTH, limit: 800000 },
];

// Computed monthly-budget summary (a mock of the aggregate API response). Paise.
export const monthlyBudget = {
  total: 4500000,
  spent: 3128000,
  daysLeft: 6,
  dailyLimit: 228700,
  status: "On Track",
};
