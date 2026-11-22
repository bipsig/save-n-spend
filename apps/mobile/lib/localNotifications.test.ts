import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "zustand/vanilla";
import type { IAccount, IBill, IGoal, INotificationPrefs } from "@save-n-spend/types";
import { fake, relaunch } from "../test/node";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/localNotifications.test.ts
//
// The real scheduler against a fake expo-notifications: what each banner says with privacy mode
// on and off, and that switching it re-plans what's queued.

// Monday 16 Nov 2026, 10:30 in Kolkata: before every evening digest, and the weekly one's day.
const NOW = Date.parse("2026-11-16T05:00:00.000Z");
const IST = "Asia/Kolkata";

type Request = { identifier: string; content: { title: string; body?: string }; trigger: unknown };

// The 2.8.1 shape by default: no tripExpenses.
const world = (summary: Record<string, number> = { income: 0, expenses: 6_350_00, savings: -6_350_00 }) => {
  const scheduled: Request[] = [];
  let cancels = 0;
  const settings = createStore(() => ({ privacyMode: false, peeking: false }));
  const stored = new Map<string, unknown>();
  const bills: Partial<IBill>[] = [
    { _id: "b1", name: "Rent", amount: 28_000_00, dueDate: "2026-11-16T06:30:00.000Z", status: "pending", recurring: true, frequency: "monthly" },
    { _id: "b2", name: "Index SIP", amount: 5_000_00, dueDate: "2026-11-16T06:30:00.000Z", status: "pending", recurring: true, frequency: "monthly", toInvestment: "a9", pausedAt: "2026-11-10T06:30:00.000Z" },
  ];
  const goals: Partial<IGoal>[] = [
    { _id: "g1", name: "Goa trip", saved: 10_000_00, target: 30_000_00, deadline: "2026-11-19T06:30:00.000Z" },
  ];

  fake("expo-notifications", {
    SchedulableTriggerInputTypes: { DATE: "date" },
    getPermissionsAsync: async () => ({ granted: true }),
    cancelAllScheduledNotificationsAsync: async () => {
      cancels++;
    },
    scheduleNotificationAsync: async (request: Request) => {
      scheduled.push(request);
      return request.identifier;
    },
  });
  fake("react-native", { Platform: { OS: "ios" } });
  fake("@/store/settings", { useSettings: settings });
  fake("@/store/session", { useSession: { getState: () => ({ user: null }) } });
  fake("@/lib/deviceStore", {
    readJson: async (key: string) => stored.get(key) ?? null,
    writeJson: async (key: string, value: unknown) => {
      stored.set(key, JSON.parse(JSON.stringify(value)));
    },
  });
  fake("@/lib/api", {
    get: async (path: string) => {
      if (path.startsWith("/transactions/summary")) return summary;
      if (path === "/bills") return bills;
      if (path === "/goals") return goals;
      if (path === "/recurring") return { expenses: [], income: [] };
      throw new Error(`unexpected ${path}`);
    },
  });
  // lib/bills pulls in React hooks and the session; the scheduler needs only these two.
  const zone = require("./zone") as typeof import("./zone");
  fake("@/lib/bills", {
    daysUntilDue: (due: Date, now: Date, z: string) => zone.calendarDaysBetween(zone.calendarDate(now, z), zone.calendarDate(due, z)),
  });

  const local = require("./localNotifications") as typeof import("./localNotifications");
  const { formatMoneyExact } = require("./money") as typeof import("./money");
  return { local, settings, scheduled, cancels: () => cancels, rs: formatMoneyExact };
};

const prefs: INotificationPrefs = { enabled: true, dailySummary: true, weeklySummary: true } as INotificationPrefs;
// Unchanged for exactly 14 days, so tonight's digest carries the owed nudge.
const accounts = [
  { _id: "p1", type: "person", name: "Ravi", balance: 1_250_00, isArchived: false, updatedAt: "2026-11-02T06:00:00.000Z" },
] as unknown as IAccount[];
const inputs = { notificationPrefs: prefs, zone: IST, accounts };

/** Lets a reschedule started by a store change run to the end. */
const settle = async () => {
  for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
};
const last = (scheduled: Request[], id: string) => [...scheduled].reverse().find((r) => r.identifier === id);
const hasAmount = (r: Request | undefined) => `${r?.content.title} ${r?.content.body ?? ""}`.includes("₹");

before(() => mock.timers.enable({ apis: ["Date"], now: NOW }));
after(() => mock.timers.reset());

test("privacy off: banners carry their amounts and the owed nudge", async () => {
  relaunch();
  const w = world();
  await w.local.rescheduleLocalNotifications(inputs);

  const daily = last(w.scheduled, "local:dailySummary");
  assert.equal(daily?.content.title, "15 Nov in review");
  assert.match(daily!.content.body!, new RegExp(`Spent ${w.rs(6_350_00)}`));
  assert.match(daily!.content.body!, new RegExp(`Ravi has owed you ${w.rs(1_250_00)} since 2 Nov`));
  assert.ok(hasAmount(last(w.scheduled, "local:weeklySummary")));
  assert.deepEqual(last(w.scheduled, "bill:b1:today:2026-11-16")?.content, {
    title: "Rent is due today",
    body: `${w.rs(28_000_00)} due today.`,
    data: { link: { screen: "bills", id: "b1" } },
  });
  assert.equal(last(w.scheduled, "goal:g1:deadline:2026-11-19")?.content.body, `${w.rs(20_000_00)} still to go.`);
  // As the reminder job: a SIP paused by archiving its holding is never reminded of (gaps row 6).
  assert.equal(w.scheduled.some((r) => r.identifier.startsWith("bill:b2:")), false);
});

test("digests: spending includes closed trips with no trips clause, and a trip-only day still gets one", async () => {
  relaunch();
  const w = world({ income: 1_20_000_00, expenses: 86_090_20, savings: 33_909_80, tripExpenses: 6_450_00 });
  await w.local.rescheduleLocalNotifications(inputs);
  const line = `Spent ${w.rs(86_090_20)}, earned ${w.rs(1_20_000_00)} — ${w.rs(33_909_80)} put aside.`;
  assert.equal(last(w.scheduled, "local:dailySummary")?.content.body, `${line} · Ravi has owed you ${w.rs(1_250_00)} since 2 Nov`);
  assert.equal(last(w.scheduled, "local:weeklySummary")?.content.body, line);

  w.settings.setState({ privacyMode: true });
  await settle();
  assert.equal(last(w.scheduled, "local:weeklySummary")?.content.body, "Your weekly summary is ready.");

  relaunch();
  const trips = world({ income: 0, expenses: 6_450_00, savings: -6_450_00, tripExpenses: 6_450_00 });
  await trips.local.rescheduleLocalNotifications({ ...inputs, accounts: [] });
  assert.equal(
    last(trips.scheduled, "local:dailySummary")?.content.body,
    `Spent ${trips.rs(6_450_00)}, earned ${trips.rs(0)} — ${trips.rs(6_450_00)} more than you earned.`,
  );
});

test("switching privacy on and off re-plans the queued digests, once each way", async () => {
  relaunch();
  const w = world();
  await w.local.rescheduleLocalNotifications(inputs);
  const before = w.cancels();
  const firstRun = w.scheduled.length;

  w.settings.setState({ privacyMode: true });
  await settle();
  assert.equal(w.cancels(), before + 1);
  assert.equal(last(w.scheduled, "local:dailySummary")?.content.body, "Your daily summary is ready.");
  assert.equal(last(w.scheduled, "local:weeklySummary")?.content.body, "Your weekly summary is ready.");
  // At 10:30 the bill and goal banners still wait for the send hour, so the re-plan queues
  // them again, masked now (gaps row 176).
  const replanned = w.scheduled.slice(firstRun).map((r) => r.identifier).sort();
  assert.deepEqual(replanned, ["bill:b1:today:2026-11-16", "goal:g1:deadline:2026-11-19", "local:dailySummary", "local:weeklySummary"]);
  assert.ok(w.scheduled.slice(firstRun).every((r) => !hasAmount(r)));

  // A peek is in-app only: nothing to re-plan.
  w.settings.setState({ peeking: true });
  w.settings.setState({ peeking: false });
  await settle();
  assert.equal(w.cancels(), before + 1);

  w.settings.setState({ privacyMode: false });
  await settle();
  assert.equal(w.cancels(), before + 2);
  assert.ok(hasAmount(last(w.scheduled, "local:dailySummary")));
});

test("a toggle before any plan, or after sign-out, schedules nothing", async () => {
  relaunch();
  const w = world();
  // Boot: the stored setting is read before the session is authed.
  w.settings.setState({ privacyMode: true });
  await settle();
  assert.equal(w.cancels(), 0);
  assert.equal(w.scheduled.length, 0);

  await w.local.rescheduleLocalNotifications(inputs);
  await w.local.clearLocalNotifications();
  const cancels = w.cancels();
  const count = w.scheduled.length;
  w.settings.setState({ privacyMode: false });
  await settle();
  assert.equal(w.cancels(), cancels);
  assert.equal(w.scheduled.length, count);
});

test("privacy on: bill and goal banners leave the amount out, title-only where nothing is left", async () => {
  relaunch();
  const w = world();
  w.settings.setState({ privacyMode: true });
  await w.local.rescheduleLocalNotifications(inputs);

  assert.deepEqual(last(w.scheduled, "bill:b1:today:2026-11-16")?.content, {
    title: "Rent is due today",
    data: { link: { screen: "bills", id: "b1" } },
  });
  assert.deepEqual(last(w.scheduled, "goal:g1:deadline:2026-11-19")?.content.title, "Goa trip is due in 3 days");
  assert.equal(last(w.scheduled, "goal:g1:deadline:2026-11-19")?.content.body, undefined);
  assert.equal(last(w.scheduled, "local:dailySummary")?.content.body, "Your daily summary is ready.");
  assert.ok(w.scheduled.every((r) => !hasAmount(r)));

  await w.local.fireGoalMilestone({ _id: "g1", name: "Goa trip", saved: 10_000_00, target: 30_000_00 }, 5_000_00, prefs);
  assert.deepEqual(last(w.scheduled, "local:goal:g1:milestone:50")?.content, {
    title: "Goa trip hit 50%",
    data: { link: { screen: "goals", id: "g1" } },
  });

  w.settings.setState({ privacyMode: false });
  await w.local.fireGoalMilestone({ _id: "g1", name: "Goa trip", saved: 15_000_00, target: 30_000_00 }, 8_000_00, prefs);
  assert.equal(last(w.scheduled, "local:goal:g1:milestone:75")?.content.body, `${w.rs(23_000_00)} of ${w.rs(30_000_00)} saved.`);
  await settle();
});

test("reminders wait for the server's send hour, under its dedupe keys, and go out once (gaps row 176)", async () => {
  relaunch();
  const w = world();
  await w.local.rescheduleLocalNotifications(inputs);
  const sixPm = Date.parse("2026-11-16T12:30:00.000Z");
  const bill = last(w.scheduled, "bill:b1:today:2026-11-16");
  const goal = last(w.scheduled, "goal:g1:deadline:2026-11-19");
  assert.equal((bill?.trigger as { date: Date }).date.getTime(), sixPm, "18:00 in Kolkata, not 10:30");
  assert.equal((goal?.trigger as { date: Date }).date.getTime(), sixPm);

  // After the send hour: at once, and remembered as sent, so the next launch says nothing.
  assert.equal(w.local.reminderFireTime(new Date(sixPm + 60_000), IST).getTime(), sixPm + 60_000);
  assert.equal(w.local.alreadySent(sixPm, sixPm - 1), false, "still to come: planned again");
  assert.equal(w.local.alreadySent(sixPm, sixPm), true);
  assert.equal(w.local.alreadySent(true, 0), true, "a 2.8.7 entry counts as sent");
});

test("the repeating-payment key is the reminder job's", async () => {
  relaunch();
  const w = world();
  const { keysSignature } = require("../../api/src/services/recurringService") as { keysSignature: (k: string[]) => string };
  for (const keys of [["netflix|64900"], ["b|2", "a|1"], []]) assert.equal(w.local.keysSignature(keys), keysSignature(keys));
});
