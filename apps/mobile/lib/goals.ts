import type { IGoal } from "@save-n-spend/types";
import { useCallback, useEffect, useState } from "react";
import { del, get, patch } from "@/lib/api";
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

/** The fields the goal form can change. `deadline: null` clears the target date. */
export type GoalPatch = {
  name: string;
  target: number;
  icon: string;
  color: string;
  deadline: string | null;
};

export const updateGoal = (id: string, body: GoalPatch) => patch<IGoal>(`/goals/${id}`, body);

// Contributions are records of money that moved, so deleting the goal leaves them —
// only the target and the progress bar built on it go away.
export const deleteGoal = (id: string) => del<null>(`/goals/${id}`);

// The edit form is a route, so it can be reached without the list that was on screen.
// There is no GET /goals/:id, and the list is small enough that filtering it here beats
// adding a route for one caller.
export const fetchGoal = async (id: string): Promise<IGoal | null> => {
  const items = await get<IGoal[]>("/goals");
  return items.find((g) => g._id === id) ?? null;
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
