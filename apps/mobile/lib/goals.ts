import type { IGoal } from "@save-n-spend/types";
import { useCallback, useEffect, useState } from "react";
import { get } from "@/lib/api";
import { useSession } from "@/store/session";

export const useGoals = () => {
  const status = useSession((s) => s.status);
  const [items, setItems] = useState<IGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (useSession.getState().status !== "authed") return;
    setLoading(true);
    setError(null);
    try {
      const data = await get<IGoal[]>("/goals");
      setItems(data);
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load goals");
    }
    finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authed") refetch();
  }, [status, refetch]);

  return { items, loading, error, refetch };
};

export const goalsSummary = (items: IGoal[]) => {
  const totalSaved = items.reduce((sum, g) => sum + g.saved, 0);
  const totalTarget = items.reduce((sum, g) => sum + g.target, 0);
  const percent = totalTarget > 0 ? Math.min(Math.round((totalSaved / totalTarget) * 100), 100) : 0;
  return { totalSaved, totalTarget, percent, count: items.length };
};

// Achieved goals sink below the active ones (stable — server order otherwise kept).
export const sortGoals = (items: IGoal[]): IGoal[] =>
  [...items].sort((a, b) => (a.saved >= a.target ? 1 : 0) - (b.saved >= b.target ? 1 : 0));
