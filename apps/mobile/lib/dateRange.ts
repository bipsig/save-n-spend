import { appZone, calendarToday } from "@/lib/zone";

// Time-range filter for the Activity feed. `all` means no bounds — the whole
// history. `offset` slides the window back whole periods (0 = current, -1 =
// previous, …).
//
// Every window is anchored on TODAY IN THE USER'S ZONE and then computed as plain calendar
// arithmetic, which is why the `Date.UTC` calls below are exact: after the anchor, none of
// these values is an instant — they are bare year/month/day triples on their way to becoming
// `YYYY-MM-DD` query strings, which the API turns back into the user's own midnights.
//
// The anchor is the load-bearing part: `new Date().getUTCDate()` is tomorrow after 6:30pm in
// India, so for five and a half hours every night "Today" would list a day that hadn't started.
export type RangeKey = "day" | "week" | "month" | "year" | "all";

export type RangeBounds = { startDate?: string; endDate?: string };

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "all", label: "All" },
];

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

// Monday-start of the week containing `now`, shifted by `offset` weeks.
const weekStartDate = (now: Date, offset: number): Date => {
  const mondayOffset = (now.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayOffset + offset * 7));
};

// The window for a range, shifted `offset` periods back (0 = current). The end is
// clamped to today, so the current period stops now while a past period spans its
// full length. endDate is inclusive (the API filters occurredAt <= end 23:59).
export const rangeBounds = (key: RangeKey, offset = 0): RangeBounds => {
  const now = calendarToday(appZone());
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const today = isoDate(now);
  const clampEnd = (iso: string) => (iso < today ? iso : today);

  switch (key) {
    case "day": {
      const day = isoDate(new Date(Date.UTC(y, m, d + offset)));
      return { startDate: day, endDate: clampEnd(day) };
    }
    case "week": {
      const start = weekStartDate(now, offset);
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 6));
      return { startDate: isoDate(start), endDate: clampEnd(isoDate(end)) };
    }
    case "month": {
      const start = new Date(Date.UTC(y, m + offset, 1));
      const end = new Date(Date.UTC(y, m + offset + 1, 0)); // last day of that month
      return { startDate: isoDate(start), endDate: clampEnd(isoDate(end)) };
    }
    case "year": {
      const start = new Date(Date.UTC(y + offset, 0, 1));
      const end = new Date(Date.UTC(y + offset, 11, 31));
      return { startDate: isoDate(start), endDate: clampEnd(isoDate(end)) };
    }
    case "all":
      return {};
  }
};

const weekRange = (start: Date, end: Date): string =>
  start.getUTCMonth() === end.getUTCMonth()
    ? `${start.getUTCDate()}–${end.getUTCDate()} ${MON[end.getUTCMonth()]} ${end.getUTCFullYear()}`
    : `${start.getUTCDate()} ${MON[start.getUTCMonth()]} – ${end.getUTCDate()} ${MON[end.getUTCMonth()]} ${end.getUTCFullYear()}`;

// Concrete caps label for the summary card and exported report headers
// ("AUGUST 2026", "4–10 AUG 2026", "2025", "ALL TIME").
export const rangeLabel = (key: RangeKey, offset = 0): string => {
  const now = calendarToday(appZone());
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  switch (key) {
    case "day": {
      const dd = new Date(Date.UTC(y, m, d + offset));
      return `${dd.getUTCDate()} ${MON[dd.getUTCMonth()]} ${dd.getUTCFullYear()}`.toUpperCase();
    }
    case "week": {
      const start = weekStartDate(now, offset);
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 6));
      return weekRange(start, end).toUpperCase();
    }
    case "month": {
      const dd = new Date(Date.UTC(y, m + offset, 1));
      return `${MON_FULL[dd.getUTCMonth()]} ${dd.getUTCFullYear()}`.toUpperCase();
    }
    case "year":
      return `${y + offset}`;
    case "all":
      return "ALL TIME";
  }
};

// Friendly relative label for the period navigator ("This Month", "Last Week",
// "Yesterday", "July 2026").
export const rangeNavLabel = (key: RangeKey, offset = 0): string => {
  const now = calendarToday(appZone());
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  switch (key) {
    case "day": {
      if (offset === 0) return "Today";
      if (offset === -1) return "Yesterday";
      const dd = new Date(Date.UTC(y, m, d + offset));
      return `${dd.getUTCDate()} ${MON[dd.getUTCMonth()]}`;
    }
    case "week": {
      if (offset === 0) return "This Week";
      if (offset === -1) return "Last Week";
      const start = weekStartDate(now, offset);
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 6));
      return start.getUTCMonth() === end.getUTCMonth()
        ? `${start.getUTCDate()}–${end.getUTCDate()} ${MON[end.getUTCMonth()]}`
        : `${start.getUTCDate()} ${MON[start.getUTCMonth()]} – ${end.getUTCDate()} ${MON[end.getUTCMonth()]}`;
    }
    case "month": {
      if (offset === 0) return "This Month";
      if (offset === -1) return "Last Month";
      const dd = new Date(Date.UTC(y, m + offset, 1));
      return `${MON_FULL[dd.getUTCMonth()]} ${dd.getUTCFullYear()}`;
    }
    case "year":
      if (offset === 0) return "This Year";
      if (offset === -1) return "Last Year";
      return `${y + offset}`;
    case "all":
      return "All Time";
  }
};
