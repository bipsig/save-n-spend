import type { BudgetCategory } from "./types";

// Monthly budget overview (Figma Budget screen).
export const monthlyBudget = {
  total: 45000,
  spent: 31280,
  daysLeft: 6,
  dailyLimit: 2287,
  status: "On Track",
};

// Per-category budgets. Shopping is intentionally over budget (red in Figma).
export const budgetCategories: BudgetCategory[] = [
  { category: "food",          spent: 4500, budget: 6000 },
  { category: "shopping",      spent: 8200, budget: 7000 },
  { category: "transport",     spent: 1800, budget: 3000 },
  { category: "entertainment", spent: 2800, budget: 3500 },
  { category: "bills",         spent: 6200, budget: 8000 },
];
