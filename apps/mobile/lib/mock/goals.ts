import type { IGoal } from "@save-n-spend/types";

// saved / target are integer paise.
export const goals: IGoal[] = [
  { _id: "g1", userId: "u1", name: "Europe Trip",    target: 15000000, saved: 8500000,  icon: "savings", color: "info" },
  { _id: "g2", userId: "u1", name: "Emergency Fund", target: 20000000, saved: 12000000, icon: "health",  color: "success" },
];
