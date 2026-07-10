// Mobile mirrors the shared API contract. Import entity types from
// @save-n-spend/types (type-only, so they erase at runtime — no bundler wiring).
// This file only adds mobile-only view/response shapes.
export type {
  ITransaction,
  IAccount,
  ICategory,
  IBudget,
  IBill,
  IGoal,
  TransactionType,
  AccountType,
  CategoryKind,
  BillStatus,
  BillFrequency,
} from "@save-n-spend/types";

// Computed dashboard response (an aggregate, not a stored entity). Paise.
export type DashboardSummary = {
  healthScore: number
  rating: string
  income: number
  expenses: number
  savings: number
  investments: number
};
