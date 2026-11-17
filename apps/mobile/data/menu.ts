import type { IconName } from "@/lib/icons"
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

// The menu row and the screen it opens say the same name (D3).
export const screenTitles = {
  home: "Home",
  activity: "Activity",
  insights: "Insights",
  more: "More",
  budget: "Budget",
  bills: "Bills",
  cashFlow: "Cash flow",
  goals: "Goals",
  investments: "Investments",
  trips: "Trips",
  reviews: "Reviews",
  accounts: "Accounts",
  categories: "Categories",
  settings: "Settings",
  help: "Help & FAQ",
} as const;

// YOUR MONEY — the three destinations that live off the tab bar.
export const moneyItems: MoreItem[] = [
  { key: "budget", label: screenTitles.budget, icon: "insights", tint: "violet", path: "/budget" },
  { key: "bills",  label: screenTitles.bills, icon: "bills", tint: "amber",  path: "/bills" },
  { key: "cashflow", label: screenTitles.cashFlow, icon: "date", tint: "blue", path: "/cash-flow" },
  { key: "goals",  label: screenTitles.goals, icon: "savings", tint: "green",  path: "/goals" },
  { key: "investments", label: screenTitles.investments, icon: "investments", tint: "teal", path: "/investments" },
  { key: "trips", label: screenTitles.trips, icon: "flight", tint: "orange", path: "/trips" },
  { key: "reviews", label: screenTitles.reviews, icon: "summary", tint: "indigo", path: "/review-history" },
];

// APP — settings & support. Help sits here as well as inside Settings' ABOUT
// group: someone looking for it on the hub shouldn't have to guess that it lives
// one level down.
export const appItems: MoreItem[] = [
  { key: "settings", label: screenTitles.settings, icon: "settings", tint: "blue", path: "/settings" },
  { key: "help", label: screenTitles.help, icon: "help", tint: "teal", path: "/help" },
];

export default moneyItems;
