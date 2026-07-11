import type { BillStatus, BillFrequency } from "@save-n-spend/types";

// Format an ISO `occurredAt` into a short display string for rows.
// Client-side derivation — the API sends only the ISO timestamp.
export const formatTxnDate = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

  const isSameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (isSameDay) return `Today, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" }); // "Jan 25"
};

// "Paid Jan 23" / "Overdue by 2 days" / "Due today" / "Due in 3 days".
// Both dates are normalized to local midnight so the label reflects whole
// calendar days regardless of the time-of-day on either timestamp.
export const formatDueLabel = (dueDate: string, status: BillStatus): string => {
  if (status === "paid") {
    return `Paid ${formatTxnDate(dueDate)}`;
  }

  const now = new Date();
  const date = new Date(dueDate);

  now.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  // date − now: negative = in the past (overdue), positive = in the future.
  // Math.round absorbs the 23/25-hour days at DST boundaries so the day count
  // is a clean integer for the exact 0/1 comparisons below.
  const diffDays = Math.round((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const overdue = Math.abs(diffDays);
    return `Overdue by ${overdue} ${overdue === 1 ? "day" : "days"}`;
  }
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  return `Due in ${diffDays} days`;
};

// Roll a recurring bill's due date forward one cycle. Server behavior when a
// recurring bill is paid; the mock rehearses it (Mark paid effects preview).
// Note: month-end overflow follows JS Date (Jan 31 + 1mo → Mar 3) — fine for bills.
export const rollDueDate = (dueDate: string, frequency: BillFrequency): string => {
  const d = new Date(dueDate);
  if (frequency === "monthly") d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
};

// "Aug 12, 2026" — full due-date display for sheets (spec: "next due rolls to …").
export const formatFullDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
