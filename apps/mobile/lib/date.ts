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
