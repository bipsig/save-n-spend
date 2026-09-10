import type { NotificationLink, NotificationType } from "@save-n-spend/types";
import type { IconName } from "@/lib/icons";
import type { ChipTint } from "@/theme/gradients";
import { appZone, calendarDate, calendarDaysBetween, calendarToday } from "@/lib/zone";

// The presentation half of notifications. The server sends what happened — a type and
// the composed copy — and this file decides what it looks like and where it leads.
//
// The split matters because the copy has to be written where the figures are (a cron
// tick at 6pm, with no app running), while the icon, the tint and the route belong to
// the client, which owns its own screens.

type Look = { icon: IconName; tint: ChipTint };

// Tints carry the same meaning they do everywhere else in the app: red is a problem,
// amber is a warning, green is progress, violet is neutral information.
export const LOOK: Record<NotificationType, Look> = {
  billReminder: { icon: "bills", tint: "blue" },
  billOverdue: { icon: "budgetOver", tint: "red" },
  budgetWarning: { icon: "budgetWarning", tint: "amber" },
  budgetExceeded: { icon: "budgetOver", tint: "red" },
  goalMilestone: { icon: "trophy", tint: "green" },
  goalDeadline: { icon: "flag", tint: "amber" },
  // The three digests share one look on purpose — they are the same kind of thing at
  // three cadences, and giving them three icons would imply a difference in what they
  // mean rather than in how often they arrive.
  dailySummary: { icon: "summary", tint: "violet" },
  weeklySummary: { icon: "summary", tint: "violet" },
  monthlySummary: { icon: "summary", tint: "violet" },
};

/**
 * Where tapping a notification goes.
 *
 * The stored link names a screen rather than a path, so renaming a route here cannot orphan a
 * notification written months ago.
 */
export const routeFor = (link?: NotificationLink): "/bills" | "/budget" | "/goals" | "/(tabs)/insights" | null => {
  switch (link?.screen) {
    case "bills": return "/bills";
    case "budget": return "/budget";
    case "goals": return "/goals";
    case "insights": return "/(tabs)/insights";
    default: return null;
  }
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * "Just now" / "12m ago" / "3h ago" / "Yesterday" / "12 Sep".
 *
 * Elapsed time up to a day, then calendar days: past that point what someone wants is the day
 * it happened. The comparison is made in the account's zone, like every other day the app names.
 */
export const notificationTime = (createdAt: string): string => {
  const instant = new Date(createdAt);
  const elapsed = Date.now() - instant.getTime();

  if (elapsed < MINUTE) return "Just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;

  const zone = appZone();
  const days = calendarDaysBetween(calendarDate(instant, zone), calendarToday(zone));

  if (days === 0) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (days === 1) return "Yesterday";

  return instant.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: zone });
};
