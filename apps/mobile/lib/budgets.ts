import type { IBudget, ICategory } from "@save-n-spend/types";
import { useCallback, useEffect, useState } from "react";
import { get } from "@/lib/api";
import { useSession } from "@/store/session";

export type BudgetSummary = { budget: IBudget; spent: number };

export const useBudgets = (month?: string) => {
  const status = useSession((s) => s.status);
  const [items, setItems] = useState<BudgetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (useSession.getState().status !== "authed") return;
    setLoading(true);
    setError(null);
    try {
      const query = month ? `?month=${month}` : "";
      const data = await get<BudgetSummary[]>(`/budgets${query}`);
      setItems(data);
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load budgets");
    }
    finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    if (status === "authed") refetch();
  }, [status, refetch]);

  return { items, loading, error, refetch };
};

export const currentMonth = (): string => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const budgetTotals = (items: BudgetSummary[]) => {
  const total = items.reduce((sum, b) => sum + b.budget.limit, 0);
  const spent = items.reduce((sum, b) => sum + b.spent, 0);
  const remaining = total - spent;
  const percentUsed = total > 0 ? Math.round((spent / total) * 1000) / 10 : 0;

  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(lastDay - now.getDate(), 0);
  const dailyLimit = daysLeft > 0 ? Math.round(Math.max(remaining, 0) / daysLeft) : 0;

  const status = percentUsed >= 100 ? "Over Budget" : percentUsed >= 80 ? "Warning" : "On Track";

  return { total, spent, remaining, percentUsed, daysLeft, dailyLimit, status };
};

export const budgetExcludedCategoryIds = (
  items: BudgetSummary[],
  categories: ICategory[],
): Set<string> => {
  const budgeted = new Set(items.map((b) => b.budget.category));
  const excluded = new Set(budgeted);
  const byId = new Map(categories.map((c) => [c._id, c]));

  for (const category of categories) {
    if (category.parent && budgeted.has(category.parent)) excluded.add(category._id);
  }
  for (const id of budgeted) {
    const parent = byId.get(id)?.parent;
    if (parent) excluded.add(parent);
  }
  return excluded;
};
