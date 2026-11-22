import type { IGoal } from "@save-n-spend/types";
import { del, get, patch, type RequestOptions } from "@/lib/api";
import { useApiQuery } from "@/lib/query/useApiQuery";
import { percentOf } from "@/lib/format/pct";

export const useGoals = () => {
  const { data, ...rest } = useApiQuery<IGoal[]>("/goals", { errorMessage: "Failed to load goals" });
  // `data` stays null until the first answer, so a screen can tell "loading" from "none".
  return { items: data ?? [], data, ...rest };
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
export const deleteGoal = (id: string, opts?: RequestOptions) => del<null>(`/goals/${id}`, opts);

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
  const percent = Math.min(percentOf(totalSaved, totalTarget), 100);
  return { totalSaved, totalTarget, percent, count: items.length };
};

// Achieved goals sink below the active ones (stable — server order otherwise kept).
export const sortGoals = (items: IGoal[]): IGoal[] =>
  [...items].sort((a, b) => (a.saved >= a.target ? 1 : 0) - (b.saved >= b.target ? 1 : 0));
