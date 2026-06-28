import type { Category } from "../categories";
import type { IconName } from "../icons";

// All amounts are integer rupees. Negative = money out, positive = money in.

export type Transaction = {
  id: string
  title: string
  category: Category
  amount: number
  date: string        // display string, e.g. "Today, 2:30 PM" or "Jan 25"
  location?: string
  hasReceipt?: boolean
};

export type BudgetCategory = {
  category: Category
  spent: number
  budget: number
};

export type BillStatus = "paid" | "pending" | "overdue";

export type Bill = {
  id: string
  name: string
  category: Category
  amount: number
  dueLabel: string    // "Due in 3 days"
  status: BillStatus
};

export type Goal = {
  id: string
  name: string
  icon: IconName
  saved: number
  target: number
};

export type DashboardSummary = {
  healthScore: number
  rating: string
  income: number
  expenses: number
  savings: number
  investments: number
};
