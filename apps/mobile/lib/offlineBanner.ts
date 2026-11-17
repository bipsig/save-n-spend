import { formatInstant } from "@/lib/format/date";
import { calendarDate, calendarDaysBetween, calendarToday } from "@/lib/zone";

/** "today at 10:52 am", "yesterday at 9:15 pm", "on 12 Nov" ("on 12 Nov 2025" in another year). */
export const savedWhen = (fetchedAt: number, zone: string): string => {
  const daysAgo = calendarDaysBetween(calendarDate(new Date(fetchedAt), zone), calendarToday(zone));
  const time = formatInstant(fetchedAt, "time", zone);
  // Ahead of today only when the phone's clock moved back; still today's copy.
  if (daysAgo <= 0) return `today at ${time}`;
  if (daysAgo === 1) return `yesterday at ${time}`;
  return `on ${formatInstant(fetchedAt, "day", zone)}`;
};

/** D18 A: the age of what this screen shows. A screen that doesn't pass its `fetchedAt` keeps
 *  the 2.8.2 line, which is the last time the app was online. */
export const offlineBannerText = (fetchedAt: number | null | undefined, lastOnlineAt: number | null, zone: string): string => {
  if (typeof fetchedAt === "number") return `Offline · showing what was saved ${savedWhen(fetchedAt, zone)}`;
  if (lastOnlineAt) return `Offline — showing data from ${formatInstant(lastOnlineAt, "time", zone)}`;
  return "Offline — showing saved data";
};
