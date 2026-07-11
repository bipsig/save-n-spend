import { IconName } from "@/lib/icons"
import type { ChipTint } from "@/theme/gradients"

// Spec §09 More hub — grouped destinations. Live status values are derived in
// the screen from the same fixtures the destination screens use.
export type MoreItem = {
  key: string;
  label: string;
  icon: IconName;
  tint: ChipTint;
  path: string;
}

// YOUR MONEY — the three destinations that live off the tab bar.
export const moneyItems: MoreItem[] = [
  { key: "budget", label: "Manage Budget", icon: "insights", tint: "violet", path: "/budget" },
  { key: "bills",  label: "Bills & Payments", icon: "bills", tint: "amber",  path: "/bills" },
  { key: "goals",  label: "Savings Goals", icon: "savings", tint: "green",  path: "/goals" },
];

// APP — settings & support.
export const appItems: MoreItem[] = [
  { key: "settings", label: "Settings", icon: "settings", tint: "blue", path: "/settings" },
];

export default moneyItems;
