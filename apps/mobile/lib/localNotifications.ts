import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { IAccount, INotificationPrefs } from "@save-n-spend/types";
import { get } from "@/lib/api";
import { formatMoneyExact } from "@/lib/money";
import { useSettings } from "@/store/settings";
import { calendarDate, calendarDaysBetween, instantInZone, zonedParts } from "@/lib/zone";

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

/** How long a person account's balance has to sit unchanged before the digest mentions it —
 *  long enough that it reads as "it's been a couple of weeks", not as nagging about a dinner
 *  split yesterday. */
const STALE_OWED_DAYS = 14;

/** Once a balance clears the two-week mark, nudge again on this cadence rather than every
 *  night. Both are pure functions of today's date, so nothing has to be persisted between
 *  launches to avoid repeating the same notification daily. */
const NUDGE_INTERVAL_DAYS = 7;

/** "11 Sep" from a real instant, in the account's own zone. Unlike `dateLabel` above, this
 *  is a moment (`Account.updatedAt`), not a calendar marker, so it reads in `zone` rather
 *  than UTC. */
const sinceLabel = (instant: Date, zone: string): string =>
  new Intl.DateTimeFormat("en-IN", { timeZone: zone, day: "numeric", month: "short" })
    .format(instant);

/**
 * The one thing to say about a stale person balance tonight, if anything.
 *
 * `updatedAt` doubles as "since when this amount has stood" because Mongoose stamps it on
 * every write, including the `$inc` a transaction makes to `balance` — the closest thing to
 * real activity tracking without adding any. A rename would also bump it, which very rarely
 * happens to a person account and is an acceptable approximation rather than a reason to
 * track balance history separately.
 */
const owedNudge = (accounts: IAccount[], zone: string): string | null => {
  const today = calendarDate(new Date(), zone);

  const stale = accounts
    .filter((a) => a.type === "person" && a.balance !== 0 && a.updatedAt)
    .map((a) => ({
      account: a,
      days: calendarDaysBetween(calendarDate(new Date(a.updatedAt!), zone), today),
    }))
    // The modulo only runs once the account has cleared the threshold, so it can never see
    // a negative "days since" and fire early.
    .filter(({ days }) => days >= STALE_OWED_DAYS && (days - STALE_OWED_DAYS) % NUDGE_INTERVAL_DAYS === 0)
    .sort((a, b) => b.days - a.days);

  if (stale.length === 0) return null;

  const { account } = stale[0];
  const since = sinceLabel(new Date(account.updatedAt!), zone);
  return account.balance > 0
    ? `${account.name} has owed you ${formatMoneyExact(account.balance)} since ${since}`
    : `You've owed ${account.name} ${formatMoneyExact(-account.balance)} since ${since}`;
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
  accounts: IAccount[],
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
  const hadFlow = summary.income !== 0 || summary.expenses !== 0;
  const nudge = owedNudge(accounts, zone);

  // An empty day is the commonest day there is, and normally the server stays quiet on one
  // too — but a stale person balance is worth saying even on a day with nothing else to
  // report, so the two are checked independently rather than one gating the other.
  if (!hadFlow && !nudge) return null;

  // Privacy mode covers the lock screen too — arguably most of all, since iOS holds this text
  // from now until it fires and nothing can re-mask it once handed over.
  const { privacyMode } = useSettings.getState();

  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_ID,
    content: {
      title: `${dateLabel(yesterday)} in review`,
      body: privacyMode
        ? "Your daily summary is ready."
        : [hadFlow ? flowLine(summary.income, summary.expenses) : null, nudge].filter(Boolean).join(" · "),
      // Read by useNotificationBridge in lib/push.ts, which routes the tap and reloads the
      // feed. Insights has nothing to show on a flow-less night, so a nudge-only banner
      // goes to the accounts screen instead — see routeFor in lib/notifications.ts.
      data: { link: { screen: hadFlow ? "insights" : "accounts" } },
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
  { notificationPrefs, zone, accounts }: {
    notificationPrefs: INotificationPrefs | undefined;
    zone: string;
    accounts: IAccount[];
  },
): Promise<void> => {
  try {
    const { granted } = await Notifications.getPermissionsAsync();
    // registerForPush asks on every authed launch; if the answer was no there is nothing to
    // schedule into.
    if (!granted) return;

    await Notifications.cancelScheduledNotificationAsync(DAILY_ID).catch(() => {
      // Nothing queued under that id yet — the ordinary case on a first launch.
    });

    await scheduleDailySummary(notificationPrefs, zone, accounts);
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
