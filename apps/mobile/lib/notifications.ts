import type { NotificationLink, NotificationType } from "@save-n-spend/types";
import type { IconName } from "@/lib/icons";
import type { ChipTint } from "@/theme/gradients";
import { appZone, calendarDate, calendarDaysBetween, calendarToday } from "@/lib/zone";

// The presentation half of notifications. The server sends what happened — a type and
// the composed copy — and this file decides what it looks like and where it leads.
//
// The split matters because the copy has to be written where the figures are (a cron
// tick at 9am, with no app running), while the icon, the tint and the route belong to
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
  weeklySummary: { icon: "summary", tint: "violet" },
};

/**
 * Where tapping a notification goes.
 *
 * The stored link names a screen rather than a path, so the route table stays the
 * client's business — renaming a route here can never orphan a notification that was
 * written months ago.
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
 * Elapsed time up to a day, then calendar days — because past that point what someone
 * wants is the day it happened, not how many hours ago that was. The day comparison is
 * made in the account's zone, like every other day the app names.
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
