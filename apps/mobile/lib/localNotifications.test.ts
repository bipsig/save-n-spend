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

const world = () => {
  const scheduled: Request[] = [];
  let cancels = 0;
  const settings = createStore(() => ({ privacyMode: false, peeking: false }));
  const stored = new Map<string, unknown>();
  const bills: Partial<IBill>[] = [
    { _id: "b1", name: "Rent", amount: 28_000_00, dueDate: "2026-11-16T06:30:00.000Z", status: "pending", recurring: true, frequency: "monthly" },
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
      if (path.startsWith("/transactions/summary")) return { income: 0, expenses: 6_350_00, savings: -6_350_00 };
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
    isSettledForPeriod: () => false,
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
  // Bill and goal banners went out at once and are remembered, so a re-plan doesn't repeat them.
  const replanned = w.scheduled.slice(firstRun).map((r) => r.identifier).sort();
  assert.deepEqual(replanned, ["local:dailySummary", "local:weeklySummary"]);
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
