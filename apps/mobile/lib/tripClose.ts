// The close day of a trip: the one day its whole share counts on, as one expense in Trips.
// Days are `YYYY-MM-DD` keys in the user's zone; the server checks the same range.

// lib/format/date's table, repeated so this file stays free of the zone store and runs in tests.
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type CloseRange = { first: string; today: string };

/** Pickable days: the trip's start day to today (today when the trip starts later). */
export const closeRange = (startDay: string, today: string): CloseRange =>
  ({ first: startDay < today ? startDay : today, today });

export const inRange = (day: string, { first, today }: CloseRange): boolean => day >= first && day <= today;

/** The last day with a trip expense, kept inside the range; today when there is none. */
export const defaultCloseDay = (expenseDays: string[], range: CloseRange): string => {
  const last = [...expenseDays].sort().at(-1);
  if (!last) return range.today;
  return last < range.first ? range.first : last > range.today ? range.today : last;
};

/** The day the trip's last expense fell on, so the picker can say so beside it. */
export const isLastExpenseDay = (day: string, expenseDays: string[]): boolean =>
  expenseDays.length > 0 && day === [...expenseDays].sort().at(-1);

export const monthOfDay = (day: string): string => day.slice(0, 7);

/** "October 2026" for "2026-10". */
export const monthTitle = (month: string): string => `${MONTHS_LONG[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

export const shiftMonth = (month: string, by: number): string => {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + by;
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** A month as weeks of seven cells, Sunday first; null pads the first and last week. */
export const monthGrid = (month: string): (string | null)[][] => {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1;
  const lead = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
};

/** Changing the day: which months the share moves between, or null when it stays in one. */
export const movesBetween = (from: string | null | undefined, to: string): { from: string; to: string } | null => {
  if (!from || monthOfDay(from) === monthOfDay(to)) return null;
  const name = (day: string) => MONTHS_LONG[Number(day.slice(5, 7)) - 1] + (day.slice(0, 4) === to.slice(0, 4) && day.slice(0, 4) === from.slice(0, 4) ? "" : ` ${day.slice(0, 4)}`);
  return { from: name(from), to: name(to) };
};
