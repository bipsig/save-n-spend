import type { IBill } from "@save-n-spend/types";

// The bills Safe to spend sets aside, kept free of runtime imports so it can be tested on its
// own (see safeToSpend.test.ts). Callers pass the zone-aware month lookup in.

type BudgetedCategory = { category: string };
type CategoryParent = { _id: string; parent: string | null };

/**
 * What unpaid bills will still take out of this month's *budgets*.
 *
 * Safe to spend is budgets' remaining money minus this, so a bill only counts if it draws on
 * a budget:
 * - not a SIP — a bill that funds an investment is saving, never spending (it's a transfer,
 *   and the budgets don't see it);
 * - in a budgeted category, or a child of one — budgets roll their children's spend in, so a
 *   "Groceries" bill draws on a "Food" budget. Rent in an unbudgeted category is real money
 *   but not budgeted money, and taking it out of the Food budget is what made a ₹10,000 food
 *   budget read ₹35,000 over;
 * - unpaid, and due this month or earlier — an overdue bill from last month still gets paid
 *   out of this month's money; next month's doesn't touch this one.
 *
 * Each bill counts once, even when both its category and that category's parent have a
 * budget — it is one payment.
 */
export const billsAgainstBudgets = (
  bills: IBill[],
  budgets: BudgetedCategory[],
  categories: CategoryParent[],
  month: string,
  monthOf: (iso: string) => string,
): { total: number; bills: IBill[] } => {
  const budgeted = new Set(budgets.map((b) => b.category));
  const parentOf = new Map(categories.map((c) => [c._id, c.parent]));
  const drawsOnBudget = (category: string | null) =>
    !!category && (budgeted.has(category) || budgeted.has(parentOf.get(category) ?? ""));

  const counted = bills.filter((b) =>
    b.status !== "paid"
    && !b.toInvestment
    && monthOf(b.dueDate) <= month
    && drawsOnBudget(b.category));
  return { total: counted.reduce((sum, b) => sum + b.amount, 0), bills: counted };
};
