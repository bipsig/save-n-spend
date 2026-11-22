import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { IAccount, IBill, IGoal, INotificationPrefs, RecurringSuggestionsPayload } from "@save-n-spend/types";
import { get } from "@/lib/api";
import {
  billNotice,
  compose,
  dailyNotice,
  goalDeadlineNotice,
  goalMilestoneNotice,
  investmentNotice,
  monthlyNotice,
  owedLine,
  recurringNotice,
  weeklyNotice,
  type Notice,
} from "@/lib/bannerCopy";
import { useSettings } from "@/store/settings";
import { calendarDate, calendarDaysBetween, dayKey, instantInZone, zonedParts } from "@/lib/zone";
import { daysUntilDue } from "@/lib/bills";
import { readJson, writeJson } from "@/lib/deviceStore";

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
const WEEKLY_ID = "local:weeklySummary";
const MONTHLY_ID = "local:monthlySummary";
const INVESTMENT_ID = "local:revalueInvestments";

/** Mirror WEEKLY_HOUR / MONTHLY_HOUR / REVALUE_HOUR in the API's jobs/reminderJob.ts. */
const WEEKLY_HOUR = 19;
const MONTHLY_HOUR = 20;
const REVALUE_HOUR = 20;

/** Fallback lead when neither the bill nor the account's own prefs set one — matches the
 *  API's billReminderLead default. */
const BILL_LEAD_DEFAULT = 3;

/** Mirrors DEADLINE_WINDOW_DAYS in the API's jobs/reminderJob.ts. */
const DEADLINE_WINDOW_DAYS = 7;

type Summary = { income: number; expenses: number; savings: number; tripExpenses?: number };

/** "11 Sep" from a calendar date, the label the server's digest uses. Formatted in UTC because
 *  that is where a calendar date's fields live (see lib/zone.ts) — reading one back in the
 *  user's own zone names the day before, anywhere west of Greenwich. */
const dateLabel = (calendar: Date): string =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short" })
    .format(calendar);

/** "August 2026" from a calendar date, for the monthly digest's title. */
const monthLabel = (calendar: Date): string =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "long", year: "numeric" })
    .format(calendar);

type Trigger = Notifications.NotificationTriggerInput;

/** At a given instant. The Android channel only matters there. */
const at = (date: Date): Trigger => ({
  type: Notifications.SchedulableTriggerInputTypes.DATE,
  date,
  ...(Platform.OS === "android" ? { channelId: "default" } : {}),
});

/**
 * Hands one banner to the OS. Privacy mode is read here, at the moment of handing over, so a
 * reschedule racing a toggle writes what the switch says now.
 */
const deliver = (identifier: string, notice: Notice, data: Record<string, unknown>, trigger: Trigger | null) =>
  Notifications.scheduleNotificationAsync({
    identifier,
    content: { ...compose(notice, { masked: useSettings.getState().privacyMode }), data },
    trigger,
  });

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
  return owedLine(account.name, account.balance, sinceLabel(new Date(account.updatedAt!), zone));
};

/** Mirrors `wantsNotification` in the API's services/notificationService.ts. `=== true` rather
 *  than a default-on check because the daily one is opt-in on both sides: an account that has
 *  never touched the switch is not asking for 365 of these a year. */
const wantsDailySummary = (prefs: INotificationPrefs | undefined): boolean =>
  prefs?.enabled !== false && prefs?.dailySummary === true;

/** Opt-in like the daily digest — 52 of these a year is still a lot to default someone into. */
const wantsWeeklySummary = (prefs: INotificationPrefs | undefined): boolean =>
  prefs?.enabled !== false && prefs?.weeklySummary === true;

/** On by default, unlike its siblings — twelve a year is a fair assumption, matching the
 *  server's own `monthlySummary !== false`. */
const wantsMonthlySummary = (prefs: INotificationPrefs | undefined): boolean =>
  prefs?.enabled !== false && prefs?.monthlySummary !== false;

/** Bills have no switch of their own server-side either — only the master one gates them. */
const wantsBillReminders = (prefs: INotificationPrefs | undefined): boolean =>
  prefs?.enabled !== false;

/** Shared by goal deadlines and milestones, same as the server's `goalMilestones` switch. */
const wantsGoalNotifications = (prefs: INotificationPrefs | undefined): boolean =>
  prefs?.enabled !== false && prefs?.goalMilestones !== false;

/** Opt-in, same as the server's `investmentReminder === true`. */
const wantsInvestmentReminder = (prefs: INotificationPrefs | undefined): boolean =>
  prefs?.enabled !== false && prefs?.investmentReminder === true;

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

  // An empty day is the commonest day there is, and normally the server stays quiet on one
  // too — but a stale person balance is worth saying even on a day with nothing else to
  // report, so the two are checked independently rather than one gating the other.
  const notice = dailyNotice(dateLabel(yesterday), hadFlow ? summary : null, owedNudge(accounts, zone));
  if (!notice) return null;

  // Read by useNotificationBridge in lib/push.ts, which routes the tap and reloads the feed.
  // Insights has nothing to show on a flow-less night, so a nudge-only banner goes to the
  // accounts screen instead — see routeFor in lib/notifications.ts.
  await deliver(DAILY_ID, notice, { link: { screen: hadFlow ? "insights" : "accounts" } }, at(fireAt));

  return fireAt;
};

/**
 * Last Monday–Sunday's digest, sent only on the Monday it closes — mirrors the server's own
 * `weekday === 1` gate, since the content isn't final on any other day.
 */
const scheduleWeeklySummary = async (
  prefs: INotificationPrefs | undefined,
  zone: string,
): Promise<void> => {
  if (!wantsWeeklySummary(prefs)) return;

  const today = calendarDate(new Date(), zone);
  if (today.getUTCDay() !== 1) return; // not Monday — nothing to close out yet

  const { year, month, day } = zonedParts(new Date(), zone);
  const fireAt = instantInZone(zone, year, month, day, WEEKLY_HOUR, 0);
  if (fireAt.getTime() <= Date.now()) return;

  // Today is Monday, so the week that just closed is the 7 days ending yesterday.
  const weekEnd = new Date(today.getTime() - 86_400_000);
  const weekStart = new Date(weekEnd.getTime() - 6 * 86_400_000);
  const startKey = weekStart.toISOString().slice(0, 10);
  const endKey = weekEnd.toISOString().slice(0, 10);

  const summary = await get<Summary>(`/transactions/summary?startDate=${startKey}&endDate=${endKey}`);
  if (summary.income === 0 && summary.expenses === 0) return;

  await deliver(WEEKLY_ID, weeklyNotice(dateLabel(weekStart), dateLabel(weekEnd), summary), { link: { screen: "insights" } }, at(fireAt));
};

/**
 * Last month's digest, sent only on the 1st — mirrors the server's own `day === 1` gate.
 */
const scheduleMonthlySummary = async (
  prefs: INotificationPrefs | undefined,
  zone: string,
): Promise<void> => {
  if (!wantsMonthlySummary(prefs)) return;

  const { year, month, day } = zonedParts(new Date(), zone);
  if (day !== 1) return;

  const fireAt = instantInZone(zone, year, month, day, MONTHLY_HOUR, 0);
  if (fireAt.getTime() <= Date.now()) return;

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const lastMonthEnd = new Date(monthStart.getTime() - 86_400_000);
  const lastMonthStart = new Date(Date.UTC(lastMonthEnd.getUTCFullYear(), lastMonthEnd.getUTCMonth(), 1));
  const startKey = lastMonthStart.toISOString().slice(0, 10);
  const endKey = lastMonthEnd.toISOString().slice(0, 10);

  const summary = await get<Summary>(`/transactions/summary?startDate=${startKey}&endDate=${endKey}`);
  if (summary.income === 0 && summary.expenses === 0) return;

  await deliver(MONTHLY_ID, monthlyNotice(monthLabel(lastMonthStart), summary), { link: { screen: "insights" } }, at(fireAt));
};

/**
 * The monthly "update your investment values" nudge, on the user's own chosen day of month —
 * mirrors the server's `day === investmentReminderDay` gate. Silent if there are no
 * investments to revalue. No content to precompute (no amounts), so unlike the digests it
 * just needs the right day and hour.
 */
const scheduleInvestmentReminder = async (
  prefs: INotificationPrefs | undefined,
  zone: string,
  accounts: IAccount[],
): Promise<void> => {
  if (!wantsInvestmentReminder(prefs)) return;

  const { year, month, day } = zonedParts(new Date(), zone);
  if (day !== (prefs?.investmentReminderDay ?? 1)) return;

  const holdings = accounts.filter((a) => a.type === "investment" && !a.isArchived);
  if (holdings.length === 0) return;

  const fireAt = instantInZone(zone, year, month, day, REVALUE_HOUR, 0);
  if (fireAt.getTime() <= Date.now()) return;

  // `id: "revalue"` mirrors the server nudge — routeFor opens the hub's revalue sheet.
  await deliver(INVESTMENT_ID, investmentNotice(holdings.length), { link: { screen: "investments", id: "revalue" } }, at(fireAt));
};

/**
 * A bill within its lead window notifies once, not once per relaunch that finds it still
 * there — the server gets this for free from a unique DB index; a local reschedule has no
 * such memory, so it keeps one itself. Never pruned: a few dozen keys, a few dozen bytes
 * each, is not worth the complexity of expiring them.
 */
const NOTIFIED_KEY = "sns.notifiedKeys";

const alreadyNotified = async (key: string): Promise<boolean> => {
  const map = await readJson<Record<string, true>>(NOTIFIED_KEY);
  return !!map?.[key];
};

/** Writes queue behind each other: the schedulers run in parallel, and two read-modify-writes of
 *  the one map at once would keep only the last, so the other banner repeats next time. */
let marking: Promise<void> = Promise.resolve();

const markNotified = (key: string): Promise<void> => {
  const write = marking.then(async () => {
    const map = (await readJson<Record<string, true>>(NOTIFIED_KEY)) ?? {};
    map[key] = true;
    await writeJson(NOTIFIED_KEY, map);
  });
  marking = write.catch(() => {});
  return write;
};

/**
 * Bills already inside their reminder window, one banner per bill per due date — the
 * content is already true the moment it's fetched, so unlike the digests above there is
 * no evening to wait for.
 */
const scheduleBillReminders = async (
  prefs: INotificationPrefs | undefined,
  zone: string,
): Promise<void> => {
  if (!wantsBillReminders(prefs)) return;

  let bills: IBill[];
  try {
    bills = await get<IBill[]>("/bills");
  }
  catch {
    return;
  }

  const now = new Date();
  for (const bill of bills) {
    // As the reminder job: a paid one-off is done; a recurring bill is reminded of by its due
    // date, which paying rolls forward, so "paid" on its row doesn't silence the next one.
    if ((bill.status === "paid" && !bill.recurring) || bill.pausedAt) continue;

    const due = new Date(bill.dueDate);
    const days = daysUntilDue(due, now, zone);
    const lead = bill.reminderDays ?? prefs?.billReminderLead ?? BILL_LEAD_DEFAULT;

    // Same three-way branch as the reminder job's remindBills, same dedupe key shape, same copy.
    const notice = billNotice({
      name: bill.name,
      amount: bill.amount,
      sip: !!bill.toInvestment,
      days,
      lead,
      on: dateLabel(calendarDate(due, zone)),
    });
    if (!notice) continue;

    const key = `bill:${bill._id}:${notice.when}:${dayKey(due, zone)}`;
    if (await alreadyNotified(key)) continue;

    await deliver(key, notice, { link: { screen: "bills", id: bill._id } }, null);
    await markNotified(key);
  }
};

/**
 * Goals whose deadline has landed inside its 7-day lookahead — same window, copy and dedupe
 * shape as the reminder job's remindGoalDeadlines.
 */
const scheduleGoalDeadlines = async (
  prefs: INotificationPrefs | undefined,
  zone: string,
): Promise<void> => {
  if (!wantsGoalNotifications(prefs)) return;

  let goals: IGoal[];
  try {
    goals = await get<IGoal[]>("/goals");
  }
  catch {
    return;
  }

  const now = new Date();
  for (const goal of goals) {
    if (!goal.deadline || goal.saved >= goal.target) continue;

    const due = new Date(goal.deadline);
    const days = daysUntilDue(due, now, zone);
    if (days < 0 || days > DEADLINE_WINDOW_DAYS) continue;

    const key = `goal:${goal._id}:deadline:${dayKey(due, zone)}`;
    if (await alreadyNotified(key)) continue;

    const notice = goalDeadlineNotice(goal.name, days, Math.max(goal.target - goal.saved, 0));
    await deliver(key, notice, { link: { screen: "goals", id: goal._id } }, null);
    await markNotified(key);
  }
};

/**
 * New repeating payments that aren't bills yet — mirrors the reminder job's remindRecurring.
 * Keyed by the set of suggestions, so it fires once per new find rather than every launch
 * the same ones are still waiting. No amounts in the copy, so privacy mode has nothing to hide.
 */
const scheduleRecurringFound = async (prefs: INotificationPrefs | undefined): Promise<void> => {
  if (prefs?.enabled === false) return;

  let expenses: RecurringSuggestionsPayload["expenses"];
  try {
    ({ expenses } = await get<RecurringSuggestionsPayload>("/recurring"));
  }
  catch {
    return;
  }
  if (expenses.length === 0) return;

  const key = `recurring:${expenses.map((p) => p.key).sort().join("|")}`;
  if (await alreadyNotified(key)) return;

  await deliver(`local:recurring`, recurringNotice(expenses.map((p) => p.title)), { link: { screen: "bills", id: "suggestions" } }, null);
  await markNotified(key);
};

/** The 25/50/75/100% crossings a goal can hit, word for word the API's `checkGoalMilestone`. */
const MILESTONES = [25, 50, 75, 100];

/** Highest milestone `before → after` straddles, or null — at most one fire per contribution,
 *  same as the server's own alert. */
const crossedMilestone = (before: number, after: number, target: number): number | null => {
  if (target <= 0) return null;
  const beforePct = (before / target) * 100;
  const afterPct = (after / target) * 100;
  const crossed = MILESTONES.filter((m) => beforePct < m && afterPct >= m);
  return crossed.length ? crossed[crossed.length - 1] : null;
};

/**
 * Fired synchronously from ContributeSheet the moment a contribution crosses a milestone —
 * the server checks the same crossing inside `contributeGoal`, but its own push has nowhere
 * to land (see the module doc above), so this is the only copy that reaches the lock screen.
 * Never throws: a failed notification must not surface as a failed contribution.
 */
export const fireGoalMilestone = async (
  goal: { _id: string; name: string; saved: number; target: number },
  added: number,
  prefs: INotificationPrefs | undefined,
): Promise<void> => {
  if (!wantsGoalNotifications(prefs)) return;

  const after = Math.min(goal.saved + added, goal.target);
  const milestone = crossedMilestone(goal.saved, after, goal.target);
  if (milestone === null) return;

  try {
    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) return;

    await deliver(
      `local:goal:${goal._id}:milestone:${milestone}`,
      goalMilestoneNotice(goal.name, milestone, after, goal.target),
      { link: { screen: "goals", id: goal._id } },
      null,
    );
  }
  catch (err) {
    console.warn("[local] could not fire goal milestone", err);
  }
};

type RescheduleInputs = {
  notificationPrefs: INotificationPrefs | undefined;
  zone: string;
  accounts: IAccount[];
};

/** What the last reschedule planned from, so a privacy toggle can plan again without the
 *  layout passing anything. Null while signed out, which keeps a toggle there a no-op. */
let lastInputs: RescheduleInputs | null = null;

/**
 * Re-plans every local banner this app owns. Safe and expected on each launch: the old ones
 * are cancelled first, so re-running cannot double up, and a preference turned off in Settings
 * takes effect on the next call rather than lingering as an already-queued notification.
 *
 * Never throws — a failed schedule must not break launch, and the bell has the same content
 * either way.
 */
export const rescheduleLocalNotifications = async (inputs: RescheduleInputs): Promise<void> => {
  lastInputs = inputs;
  const { notificationPrefs, zone, accounts } = inputs;
  try {
    const { granted } = await Notifications.getPermissionsAsync();
    // registerForPush asks on every authed launch; if the answer was no there is nothing to
    // schedule into.
    if (!granted) return;

    // This app owns its whole local-notification namespace, so a full cancel-and-reschedule
    // is simpler and more correct than tracking a growing set of per-bill/per-goal ids to
    // selectively cancel — a deleted or rescheduled bill just stops having a pending banner.
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {
      // Nothing queued yet — the ordinary case on a first launch.
    });

    // Each scheduler is isolated: several hit the network (the digests fetch /summary, bills
    // and goals fetch their lists), and a single failure must not abort the ones after it.
    // Before, one rejected fetch here silently dropped every later digest/reminder — so a
    // flaky daily-summary call took the weekly, monthly, bill and goal banners down with it.
    const safe = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
      try {
        await fn();
      }
      catch (err) {
        console.warn(`[local] ${label} failed to schedule`, err);
      }
    };

    await Promise.all([
      safe("daily", () => scheduleDailySummary(notificationPrefs, zone, accounts)),
      safe("weekly", () => scheduleWeeklySummary(notificationPrefs, zone)),
      safe("monthly", () => scheduleMonthlySummary(notificationPrefs, zone)),
      safe("bills", () => scheduleBillReminders(notificationPrefs, zone)),
      safe("goals", () => scheduleGoalDeadlines(notificationPrefs, zone)),
      safe("investment", () => scheduleInvestmentReminder(notificationPrefs, zone, accounts)),
      safe("recurring", () => scheduleRecurringFound(notificationPrefs)),
    ]);
  }
  catch (err) {
    console.warn("[local] could not reschedule", err);
  }
};

/** Drops everything queued, for sign-out — the next account's evening is not this one's. */
export const clearLocalNotifications = async (): Promise<void> => {
  lastInputs = null;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }
  catch {
    // Signing out must not be blockable.
  }
};

// A queued banner keeps the text it was scheduled with, so switching privacy mode re-plans
// them: a digest planned with figures loses them, and one planned without gets them back.
// Peeking is in-app only and never reaches the lock screen, so it doesn't count.
useSettings.subscribe((state, prev) => {
  if (state.privacyMode !== prev.privacyMode && lastInputs) void rescheduleLocalNotifications(lastInputs);
});
