import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { INotificationPrefs } from "@save-n-spend/types";
import { get } from "@/lib/api";
import { formatMoneyExact } from "@/lib/money";
import { useSettings } from "@/store/settings";
import { instantInZone, zonedParts } from "@/lib/zone";

// Banners on the lock screen, scheduled by the phone rather than pushed to it.
//
// The reminder job on the server composes everything in the bell and would push it as well,
// but a SideStore build is re-signed with a free Apple ID and Apple grants `aps-environment`
// only to a paid team. The entitlement is stripped at install, APNs never issues a token, and
// so every push the server sends has nowhere to go — see registerForPush in lib/push.ts, which
// fails at exactly that step. A local notification needs neither entitlement nor token, and is
// the only way a banner reaches the Home Screen on this distribution.
//
// The cost is that the phone must know the copy before the moment arrives. Yesterday's totals
// are final, so the digest can be composed on launch and handed to iOS to deliver at six —
// but only if the app is opened at some point beforehand. A day it is never opened stays
// silent and the digest is in the bell alone.

/** Mirrors SEND_HOUR / DAILY_HOUR in the API's jobs/reminderJob.ts, so the banner arrives with
 *  the feed entry it belongs to rather than an hour off it. */
const DIGEST_HOUR = 18;

/** Prefixed so a reschedule clears only what this module owns. */
const DAILY_ID = "local:dailySummary";

type Summary = { income: number; expenses: number; savings: number };

/** "11 Sep" from a calendar date, the label the server's digest uses. Formatted in UTC because
 *  that is where a calendar date's fields live (see lib/zone.ts) — reading one back in the
 *  user's own zone names the day before, anywhere west of Greenwich. */
const dateLabel = (calendar: Date): string =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short" })
    .format(calendar);

/** Word for word the server's `flowLine`, minus the transaction count: /transactions/summary
 *  returns totals only, and a figure invented here could disagree with the feed entry. */
const flowLine = (income: number, expenses: number): string => {
  const net = income - expenses;
  return `Spent ${formatMoneyExact(expenses)}, earned ${formatMoneyExact(income)}`
    + (net >= 0
      ? ` — ${formatMoneyExact(net)} put aside.`
      : ` — ${formatMoneyExact(-net)} more than you earned.`);
};

/** Mirrors `wantsNotification` in the API's services/notificationService.ts. `=== true` rather
 *  than a default-on check because the daily one is opt-in on both sides: an account that has
 *  never touched the switch is not asking for 365 of these a year. */
const wantsDailySummary = (prefs: INotificationPrefs | undefined): boolean =>
  prefs?.enabled !== false && prefs?.dailySummary === true;

/**
 * Tonight's digest, if there is one to send.
 *
 * Only ever schedules for today: tomorrow's digest covers today, and today's totals are still
 * moving. Returns the instant it was scheduled for, or null if there was nothing to schedule.
 */
const scheduleDailySummary = async (
  prefs: INotificationPrefs | undefined,
  zone: string,
): Promise<Date | null> => {
  if (!wantsDailySummary(prefs)) return null;

  const { year, month, day } = zonedParts(new Date(), zone);
  const fireAt = instantInZone(zone, year, month, day, DIGEST_HOUR, 0);

  // Six has already gone. iOS drops a past date silently, and the server has either sent the
  // feed entry or is about to, so there is nothing useful to do until tomorrow's launch.
  if (fireAt.getTime() <= Date.now()) return null;

  // Built from the zone's own y/m/d, so "yesterday" is yesterday where the user is rather than
  // wherever UTC happens to be. A calendar date, not a moment.
  const yesterday = new Date(Date.UTC(year, month - 1, day) - 86_400_000);
  const key = yesterday.toISOString().slice(0, 10);

  // The endpoint clamps to zone-local day bounds server-side, so one key for both ends is
  // yesterday whole.
  const summary = await get<Summary>(`/transactions/summary?startDate=${key}&endDate=${key}`);

  // An empty day is the commonest day there is, and the server stays quiet on one. A banner
  // saying nothing happened would be the only notification the two halves disagreed on.
  if (summary.income === 0 && summary.expenses === 0) return null;

  // Privacy mode covers the lock screen too — arguably most of all, since iOS holds this text
  // from now until it fires and nothing can re-mask it once handed over.
  const { privacyMode } = useSettings.getState();

  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_ID,
    content: {
      title: `${dateLabel(yesterday)} in review`,
      body: privacyMode ? "Your daily summary is ready." : flowLine(summary.income, summary.expenses),
      // Read by useNotificationBridge in lib/push.ts, which routes the tap and reloads the
      // feed — so a tapped banner lands on Insights exactly as a real push would.
      data: { link: { screen: "insights" } },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
      ...(Platform.OS === "android" ? { channelId: "default" } : {}),
    },
  });

  return fireAt;
};

/**
 * Re-plans every local banner this app owns. Safe and expected on each launch: the old ones
 * are cancelled first, so re-running cannot double up, and a preference turned off in Settings
 * takes effect on the next call rather than lingering as an already-queued notification.
 *
 * Never throws — a failed schedule must not break launch, and the bell has the same content
 * either way.
 */
export const rescheduleLocalNotifications = async (
  { notificationPrefs, zone }: { notificationPrefs: INotificationPrefs | undefined; zone: string },
): Promise<void> => {
  try {
    const { granted } = await Notifications.getPermissionsAsync();
    // registerForPush asks on every authed launch; if the answer was no there is nothing to
    // schedule into.
    if (!granted) return;

    await Notifications.cancelScheduledNotificationAsync(DAILY_ID).catch(() => {
      // Nothing queued under that id yet — the ordinary case on a first launch.
    });

    await scheduleDailySummary(notificationPrefs, zone);
  }
  catch (err) {
    console.warn("[local] could not reschedule", err);
  }
};

/** Drops everything queued, for sign-out — the next account's evening is not this one's. */
export const clearLocalNotifications = async (): Promise<void> => {
  try {
    await Notifications.cancelScheduledNotificationAsync(DAILY_ID);
  }
  catch {
    // Signing out must not be blockable.
  }
};
