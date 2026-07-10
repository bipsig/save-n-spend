import type { BudgetCategory } from "./types";

// Money fields are integer paise (e.g. 4500000 = ₹45,000). daysLeft is a plain count.
export const monthlyBudget = {
  total: 4500000,
  spent: 3128000,
  daysLeft: 6,
  dailyLimit: 228700,
  status: "On Track",
};

// Per-category budgets. Shopping is intentionally over budget (red in Figma).
export const budgetCategories: BudgetCategory[] = [
  { category: "food",          spent: 450000, budget: 600000 },
  { category: "shopping",      spent: 820000, budget: 700000 },
  { category: "transport",     spent: 180000, budget: 300000 },
  { category: "entertainment", spent: 280000, budget: 350000 },
  { category: "bills",         spent: 620000, budget: 800000 },
];
