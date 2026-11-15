import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "crypto";
import { ObjectId } from "mongodb";
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";
import { useTestApi, sentPushes, type TestUser } from "../harness";
import { MISSING, failed, resetClock, setClock, txn } from "./readHelpers";
import { notify, notifyUserId, wantsNotification } from "../../src/services/notificationService";
import { isValidPushToken, sendPush } from "../../src/services/pushService";

// The notification feed (GET /notifications, PATCH /notifications/:id/read, POST
// /notifications/read-all), budget alerts raised by POST /transactions, and the notifier and
// push transport underneath. Pushes are recorded by test/env.ts, never sent to Expo.

const api = useTestApi();
afterEach(resetClock);
after(resetClock);

const pushToken = () => `ExponentPushToken[t4-${randomBytes(6).toString("hex")}]`;
const pushesTo = (token: string) => sentPushes.filter((p) => p.to === token);
const stored = async (u: TestUser) => (await api.ro.col("notifications").find<{ _id: ObjectId; type: string; title: string; body: string; dedupeKey: string; pushedAt: Date | null; readAt: Date | null; link?: unknown }>({ userId: new ObjectId(u.id) }))
    .sort((a, b) => String(a._id).localeCompare(String(b._id)));
const userDoc = async (u: TestUser) => (await api.ro.col("users").find<{ pushToken?: string }>({ _id: new ObjectId(u.id) }))[0];

/** Runs `fn` with console.warn/error muted: the failures it causes on purpose are logged by the code. */
const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
    const { warn, error } = console;
    console.warn = console.error = () => undefined;
    try { return await fn(); } finally { console.warn = warn; console.error = error; }
};

/** Swaps the recorded Expo send for `fake` while `fn` runs, with the warnings it causes muted. */
const withExpo = async (fake: (m: ExpoPushMessage[]) => Promise<ExpoPushTicket[]>, fn: () => Promise<void>) => {
    const real = Expo.prototype.sendPushNotificationsAsync;
    Expo.prototype.sendPushNotificationsAsync = fake;
    try { await quiet(fn); } finally { Expo.prototype.sendPushNotificationsAsync = real; }
};

const NOW = "2026-04-15T06:30:00Z";
let me: TestUser;
let token: string;
const cat: Record<string, string> = {};
let bank: string;

before(async () => {
    await api.ready();
    me = await api.user("notify");
    token = pushToken();
    assert.equal((await me.send("PATCH", "/users/me", { pushToken: token })).status, 200);
    for (const c of (await me.send("GET", "/categories")).json.data as { _id: string; name: string }[]) cat[c.name] = c._id;
    bank = await me.account("Bank", { startingBalance: 10_000_000 });
});

const spend = (u: TestUser, amount: number, category: string, at = "2026-04-15T05:00:00Z", account = bank) =>
    txn(u, "expense", amount, account, at, { category, title: "Spend" });

// ---- Budget alerts ----------------------------------------------------------------------------

test("budget alerts: 80% then over, once each, pushed with the unread badge; a parent's limit names the child", async () => {
    setClock(NOW);
    const budget = await me.send("POST", "/budgets", { category: cat["Food & Dining"], month: "2026-04", limit: 100_000 });
    assert.equal(budget.status, 201, budget.text);
    const id = budget.json.data._id;

    await spend(me, 50_000, cat.Groceries);
    assert.equal((await stored(me)).length, 0, "50% says nothing");

    setClock("2026-04-15T06:31:00Z");
    await spend(me, 35_000, cat.Groceries);
    let rows = await stored(me);
    assert.equal(rows.length, 1);
    assert.deepEqual({ type: rows[0].type, title: rows[0].title, body: rows[0].body, dedupeKey: rows[0].dedupeKey, link: rows[0].link }, {
        type: "budgetWarning", title: "Food & Dining is at 85%", body: "₹150 left of your ₹1,000 limit. Includes Groceries.",
        dedupeKey: `budget:${id}:2026-04:warn`, link: { screen: "budget", id },
    });
    assert.ok(rows[0].pushedAt instanceof Date, "pushedAt not set");
    assert.deepEqual(pushesTo(token), [{
        to: token, title: "Food & Dining is at 85%", body: "₹150 left of your ₹1,000 limit. Includes Groceries.",
        data: { link: { screen: "budget", id } }, badge: 1, sound: "default", priority: "high", channelId: "default",
    }]);

    // Still a warning: the same key, so nothing new.
    await spend(me, 5_000, cat.Restaurants);
    assert.equal((await stored(me)).length, 1);
    assert.equal(pushesTo(token).length, 1);

    setClock("2026-04-15T06:32:00Z");
    await spend(me, 20_000, cat["Food & Dining"]);
    rows = await stored(me);
    const over = rows.find((r) => r.type === "budgetExceeded")!;
    assert.deepEqual([over.title, over.body, over.dedupeKey], ["Food & Dining is over budget", "₹1,100 spent against a ₹1,000 limit.", `budget:${id}:2026-04:over`]);
    assert.equal(pushesTo(token).at(-1)!.badge, 2);

    // Over again, an edit, a transfer, a month with no budget: nothing.
    const more = await spend(me, 1_000, cat.Groceries);
    assert.equal((await me.send("PATCH", `/transactions/${more}`, { amount: 2_000 })).status, 200);
    const other = await me.account("Savings", { startingBalance: 0 });
    await txn(me, "transfer", 1_000, bank, NOW, { toAccount: other });
    await spend(me, 500_000, cat["Food & Dining"], "2026-03-15T05:00:00Z");
    assert.equal((await stored(me)).length, 2);
    assert.equal(pushesTo(token).length, 2);
});

test("budget alerts: a sub-category's own limit; switched off, nothing; no token, in-app only", async () => {
    setClock(NOW);
    const u = await api.user("notify-sub");
    const b = await u.account("Bank", { startingBalance: 1_000_000 });
    const clothing = ((await u.send("GET", "/categories")).json.data as { _id: string; name: string }[]).find((c) => c.name === "Clothing")!._id;
    const shopping = await u.send("POST", "/budgets", { category: clothing, month: "2026-04", limit: 10_000 });
    assert.equal(shopping.status, 201);
    await spend(u, 9_000, clothing, NOW, b);
    const [row] = await stored(u);
    assert.deepEqual([row.title, row.body, row.pushedAt], ["Clothing is at 90%", "₹10 left of your ₹100 limit.", null]);

    const electronics = ((await u.send("GET", "/categories")).json.data as { _id: string; name: string }[]).find((c) => c.name === "Electronics")!._id;
    assert.equal((await u.send("POST", "/budgets", { category: electronics, month: "2026-04", limit: 10_000 })).status, 201);
    assert.equal((await u.send("PATCH", "/users/me", { prefs: { notifications: { budgetAlerts: false } } })).status, 200);
    await spend(u, 20_000, electronics, NOW, b);
    assert.equal((await stored(u)).length, 1);
    assert.equal((await u.send("PATCH", "/users/me", { prefs: { notifications: { budgetAlerts: true, enabled: false } } })).status, 200);
    await spend(u, 20_000, electronics, NOW, b);
    assert.equal((await stored(u)).length, 1);
    assert.equal((await u.send("PATCH", "/users/me", { prefs: { notifications: { enabled: true } } })).status, 200);
    await spend(u, 1_000, electronics, NOW, b);
    assert.deepEqual((await stored(u)).map((r) => r.title), ["Clothing is at 90%", "Electronics is over budget"]);
});

test("goal milestones: the highest one crossed, once", async () => {
    setClock("2026-04-15T06:40:00Z");
    const g = await me.send("POST", "/goals", { name: "Car", target: 100_000 });
    await me.send("POST", `/goals/${g.json.data._id}/contribute`, { amount: 60_000 });
    await me.send("POST", `/goals/${g.json.data._id}/contribute`, { amount: 5_000 });
    await me.send("POST", `/goals/${g.json.data._id}/contribute`, { amount: 35_000 });
    const titles = (await stored(me)).filter((r) => r.type === "goalMilestone").map((r) => r.title);
    assert.deepEqual(titles, ["Car is 50% there", "Car is fully funded 🎉"]);
});

// ---- The feed --------------------------------------------------------------------------------

test("feed: newest first, the page shape, unread over the whole feed", async () => {
    setClock(NOW);
    const r = await me.send("GET", "/notifications");
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.message, "Notifications fetched");
    const d = r.json.data;
    assert.deepEqual([d.page, d.limit, d.total, d.hasNextPage, d.unread, d.items.length], [1, 20, 4, false, 4, 4]);
    assert.deepEqual(d.items.map((i: { type: string }) => i.type), ["goalMilestone", "goalMilestone", "budgetExceeded", "budgetWarning"]);
    for (const i of d.items) {
        for (const f of ["__v", "userId"]) assert.equal(f in i, false, `notification still sends ${f}`);
        for (const f of ["_id", "type", "title", "body", "dedupeKey", "pushedAt", "readAt", "createdAt", "updatedAt"]) assert.ok(f in i, `notification lost ${f}`);
    }
    const page2 = (await me.send("GET", "/notifications?page=2&limit=3")).json.data;
    assert.deepEqual([page2.items.length, page2.hasNextPage, page2.unread, page2.total], [1, false, 4, 4]);
    assert.equal(page2.items[0].type, "budgetWarning");
    for (const q of ["limit=51", "limit=0", "page=0", "page=abc"]) failed(await me.send("GET", `/notifications?${q}`), 400, "invalid_input");
});

test("feed: mark one read keeps the first time; another user's or a bad id is 404; extra fields 400", async () => {
    setClock(NOW);
    const [first] = (await me.send("GET", "/notifications")).json.data.items;
    const r = await me.send("PATCH", `/notifications/${first._id}/read`);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.message, "Notification marked as read");
    assert.deepEqual([r.json.data.unread, r.json.data.notification._id, r.json.data.notification.readAt], [3, first._id, "2026-04-15T06:30:00.000Z"]);
    setClock("2026-04-16T06:30:00Z");
    const again = await me.send("PATCH", `/notifications/${first._id}/read`, {});
    assert.deepEqual([again.status, again.json.data.notification.readAt, again.json.data.unread], [200, "2026-04-15T06:30:00.000Z", 3]);

    setClock(NOW);
    const other = await api.user("notify-other");
    for (const id of [first._id, MISSING, "abc"]) failed(await other.send("PATCH", `/notifications/${id}/read`), 404, "not_found", "That notification doesn't exist any more");
    assert.deepEqual((await other.send("GET", "/notifications")).json.data, { items: [], page: 1, limit: 20, hasNextPage: false, total: 0, unread: 0 });
    failed(await me.send("PATCH", `/notifications/${first._id}/read`, { readAt: null }), 400, "invalid_input", "This request had something the server didn't expect. Please update the app");
    failed(await me.send("POST", "/notifications/read-all", { all: true }), 400, "invalid_input");
});

test("feed: read-all clears only your own; it isn't keyed, so a key is ignored and nothing is stored", async () => {
    setClock(NOW);
    const other = await api.user("notify-other2");
    await notifyUserId(other.id, { type: "billReminder", title: "Rent due", body: "Soon.", dedupeKey: "t4:other:1" });
    const key = `t4-${randomBytes(6).toString("hex")}`;
    const r = await me.send("POST", "/notifications/read-all", undefined, { headers: { "Idempotency-Key": key } });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.json.data, r.json.message], [{ unread: 0 }, "Notifications marked as read"]);
    assert.equal(await api.ro.col("idempotencyrecords").count({ key }), 0);
    assert.equal((await me.send("GET", "/notifications")).json.data.unread, 0);
    assert.equal((await other.send("GET", "/notifications")).json.data.unread, 1);
    for (const [method, p] of [["GET", "/notifications"], ["POST", "/notifications/read-all"], ["PATCH", `/notifications/${MISSING}/read`]] as const) {
        failed(await api.send(method, p), 401, "unauthenticated");
    }
});

// ---- The notifier and the push transport -----------------------------------------------------

test("wantsNotification: the primary switch silences all; digests and the revalue nudge are opt-in", () => {
    const types = ["billReminder", "billOverdue", "budgetWarning", "budgetExceeded", "goalMilestone", "goalDeadline", "dailySummary", "weeklySummary", "monthlySummary", "revalueInvestments", "recurringFound"] as const;
    const on = (prefs: Parameters<typeof wantsNotification>[0]) => types.filter((t) => wantsNotification(prefs, t));
    assert.deepEqual(on(undefined), ["billReminder", "billOverdue", "budgetWarning", "budgetExceeded", "goalMilestone", "goalDeadline", "monthlySummary", "recurringFound"]);
    assert.deepEqual(on({ enabled: false, dailySummary: true }), []);
    assert.deepEqual(on({ budgetAlerts: false, goalMilestones: false, monthlySummary: false, dailySummary: true, weeklySummary: true, investmentReminder: true }),
        ["billReminder", "billOverdue", "dailySummary", "weeklySummary", "revalueInvestments", "recurringFound"]);
});

test("notify: once per key; no token is in-app only; a bad row fails quietly", async () => {
    setClock(NOW);
    const u = await api.user("notify-direct");
    const input = { type: "billReminder" as const, title: "Rent due in 3 days", body: "₹20,000 due on 18 Apr.", dedupeKey: "bill:x:due:2026-04-18", link: { screen: "bills", id: "x" } };
    assert.equal(await notifyUserId(u.id, input), true);
    assert.equal(await notifyUserId(u.id, input), false, "the same key twice");
    assert.equal(await notifyUserId(u.id, { ...input, dedupeKey: "other", title: "" }), false, "a title is required");
    assert.equal(await notifyUserId(new ObjectId().toHexString(), input), false, "no such user");
    assert.equal(await quiet(() => notifyUserId("not-an-id", input)), false, "a bad id");
    assert.equal(await notify({ _id: u.id, prefs: { notifications: { enabled: false } } }, { ...input, dedupeKey: "off" }), false);
    const rows = await stored(u);
    assert.deepEqual(rows.map((r) => [r.dedupeKey, r.pushedAt]), [["bill:x:due:2026-04-18", null]]);
});

test("push: Expo refusing a dead token forgets it; another refusal or a throw keeps it; neither fails the notification", async () => {
    setClock(NOW);
    const u = await api.user("notify-push");
    const dead = pushToken();
    assert.equal((await u.send("PATCH", "/users/me", { pushToken: dead })).status, 200);
    const input = (key: string) => ({ type: "billOverdue" as const, title: "Rent is overdue", body: "₹20,000 was due 2 days ago.", dedupeKey: key });

    await withExpo(async () => [{ status: "error", message: "gone", details: { error: "MessageTooBig" } }], async () => {
        assert.equal(await notifyUserId(u.id, input("too-big")), true);
    });
    assert.equal((await userDoc(u)).pushToken, dead, "a refusal that isn't about the token keeps it");
    await withExpo(async () => { throw new Error("Expo is down"); }, async () => {
        assert.equal(await notifyUserId(u.id, input("down")), true);
    });
    assert.equal((await userDoc(u)).pushToken, dead);
    await withExpo(async () => [{ status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } }], async () => {
        assert.equal(await notifyUserId(u.id, input("dead")), true);
    });
    assert.equal((await userDoc(u)).pushToken, undefined, "the dead token is still on the account");
    assert.deepEqual((await stored(u)).map((r) => [r.dedupeKey, r.pushedAt]), [["too-big", null], ["down", null], ["dead", null]]);
    assert.equal(pushesTo(dead).length, 0);
});

test("push: only Expo tokens are sent", async () => {
    assert.deepEqual([isValidPushToken(undefined), isValidPushToken(null), isValidPushToken("abc"), isValidPushToken(pushToken())], [false, false, false, true]);
    const before = sentPushes.length;
    assert.equal(await sendPush({ token: "not-a-token", title: "x", body: "y" }), false);
    assert.equal(sentPushes.length, before);
    const t = pushToken();
    assert.equal(await sendPush({ token: t, title: "x", body: "y", badge: 3 }), true);
    assert.deepEqual(pushesTo(t), [{ to: t, title: "x", body: "y", data: undefined, badge: 3, sound: "default", priority: "high", channelId: "default" }]);
});
