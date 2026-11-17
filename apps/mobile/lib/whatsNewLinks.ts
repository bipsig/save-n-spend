// What a release note's link opens, in words, for its accessibility label. Pure, so a
// test can check every link in the bundled notes has a name.

const DESTINATIONS: Record<string, string> = {
  "/": "Home",
  "/activity": "Activity",
  "/bills?suggestions=1": "Bills, with the recurring payments it found",
  "/cash-flow": "Cash flow",
  "/health": "your health score",
  "/help": "Help & FAQ",
  "/insights": "Insights",
  "/insights?export=1": "the Insights export",
  "/investments": "Investments",
  "/investments?export=1": "the Investments export",
  "/investments?tab=trends": "Investments, on Trends",
  "/manage-accounts": "Accounts",
  "/review-history": "your reviews",
  "/trips": "Trips",
  "/whats-new": "What's new",
};

export const linkDestination = (href: string): string | undefined => DESTINATIONS[href];
