import type { Goal } from "./types";

// Savings goals (Figma Home goals + Savings Goals screen).
// saved / target are integer paise (e.g. 8500000 = ₹85,000).
export const goals: Goal[] = [
  { id: "g1", name: "Europe Trip",    icon: "savings", saved: 8500000,  target: 15000000 },
  { id: "g2", name: "Emergency Fund", icon: "health",  saved: 12000000, target: 20000000 },
];
