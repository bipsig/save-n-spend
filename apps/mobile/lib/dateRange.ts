// Time-range filter for the Activity feed. Bounds are UTC-aligned to match how
// the app stores occurredAt and how every server aggregation windows (dashboard,
// budgets, transaction summary). `all` means no bounds — the whole history.
export type RangeKey = "day" | "week" | "month" | "year" | "all";

export type RangeBounds = { startDate?: string; endDate?: string };

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "all", label: "All" },
];

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

export const rangeBounds = (key: RangeKey): RangeBounds => {
  const now = new Date();
  const endDate = isoDate(now);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();

  switch (key) {
    case "day":
      return { startDate: endDate, endDate };
    case "week": {
      // Week starts Monday; getUTCDay is 0 (Sun)..6 (Sat).
      const mondayOffset = (now.getUTCDay() + 6) % 7;
      return { startDate: isoDate(new Date(Date.UTC(y, m, d - mondayOffset))), endDate };
    }
    case "month":
      return { startDate: isoDate(new Date(Date.UTC(y, m, 1))), endDate };
    case "year":
      return { startDate: isoDate(new Date(Date.UTC(y, 0, 1))), endDate };
    case "all":
      return {};
  }
};

// Caps label for the summary card ("TODAY", "AUGUST 2026", "ALL TIME"…).
export const rangeLabel = (key: RangeKey): string => {
  const now = new Date();
  switch (key) {
    case "day":
      return "TODAY";
    case "week":
      return "THIS WEEK";
    case "month":
      return `${now.toLocaleString("default", { month: "long", timeZone: "UTC" })} ${now.getUTCFullYear()}`.toUpperCase();
    case "year":
      return String(now.getUTCFullYear());
    case "all":
      return "ALL TIME";
  }
};
