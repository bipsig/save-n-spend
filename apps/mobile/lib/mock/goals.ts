import type { IGoal } from "@save-n-spend/types";

// saved / target are integer paise.
export const goals: IGoal[] = [
  { _id: "g1", userId: "u1", name: "Europe Trip",    target: 15000000, saved: 8500000,  icon: "savings", color: "info" },
  { _id: "g2", userId: "u1", name: "Emergency Fund", target: 20000000, saved: 12000000, icon: "health",  color: "success" },
];

// MOCK of GET /goals — the real endpoint aggregates these totals server-side.
// The client consumes the pre-computed summary; swap this for a fetch when the API lands.
export const goalsSummary = (): { totalSaved: number; totalTarget: number; count: number } => ({
  totalSaved: goals.reduce((sum, g) => sum + g.saved, 0),
  totalTarget: goals.reduce((sum, g) => sum + g.target, 0),
  count: goals.length,
});
