import type { IGoal } from "@save-n-spend/types";
import { useCallback, useEffect, useState } from "react";
import { del, get, patch } from "@/lib/api";
import { useSession } from "@/store/session";
import { appZone, zonedParts } from "@/lib/zone";

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

/** Zone-local month index from year 0, so two months compare with a single subtraction
 *  — same convention the API's highlightSnapshotMath/goalWatch use server-side. */
const monthOrdinal = (instant: Date, zone: string): number => {
  const { year, month } = zonedParts(instant, zone);
  return year * 12 + (month - 1);
};

export type GoalPace = {
  /** Null when there's no saving rate yet to project from (nothing saved, or the goal
   *  was created this same month) — not zero, since zero would read as "any day now". */
  monthsNeeded: number | null;
  projectedDate: string | null; // ISO
};

/**
 * Saved-per-month-since-created, projected forward to the target — the same rate
 * convention the health score's goalsPillar and the dashboard's Goal Watch use, just run
 * for every goal here rather than only the closest one. Deadline-agnostic on purpose:
 * this is "how's it going", not a pass/fail against a date (see goalsPillar for that).
 */
export const goalPace = (goal: IGoal): GoalPace => {
  const remaining = goal.target - goal.saved;
  if (remaining <= 0) return { monthsNeeded: 0, projectedDate: null }; // achieved

  const zone = appZone();
  const now = new Date();
  const monthsRunning = Math.max(1, monthOrdinal(now, zone) - monthOrdinal(new Date(goal.createdAt), zone));
  const rate = goal.saved / monthsRunning;
  if (rate <= 0) return { monthsNeeded: null, projectedDate: null };

  const monthsNeeded = Math.ceil(remaining / rate);
  const projected = new Date(now);
  projected.setUTCMonth(projected.getUTCMonth() + monthsNeeded);
  return { monthsNeeded, projectedDate: projected.toISOString() };
};
