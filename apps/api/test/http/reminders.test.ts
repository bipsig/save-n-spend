import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "crypto";
import { ObjectId } from "mongodb";
import { useTestApi, sentPushes, type TestUser } from "../harness";
import { resetClock, setClock, tripWithExpense, txn } from "./readHelpers";
import { flowLine, runReminders } from "../../src/jobs/reminderJob";

// The hourly reminder job's logic, run directly with `runReminders(now)` (no cron, no timers)
// over this file's own users. Monday 1 June 2026 in Kolkata: a bill day, a Monday and the 1st.

const api = useTestApi();
afterEach(resetClock);
after(resetClock);

type Row = { _id: ObjectId; type: string; title: string; body: string; dedupeKey: string; pushedAt: Date | null };
const feed = async (u: TestUser) => (await api.ro.col("notifications").find<Row>({ userId: new ObjectId(u.id) }))
    .sort((a, b) => String(a._id).localeCompare(String(b._id)));
const titles = async (u: TestUser) => (await feed(u)).map((r) => r.title).sort();

// 18:15, 19:15 and 20:30 in Kolkata.
const AT_1815 = new Date("2026-06-01T12:45:00Z");
const AT_1915 = new Date("2026-06-01T13:45:00Z");
const AT_2030 = new Date("2026-06-01T15:00:00Z");

let me: TestUser;
let token: string;
const ids: Record<string, string> = {};

before(async () => {
    await api.ready();
    me = await api.user("reminders");
    token = `ExponentPushToken[t4-${randomBytes(6).toString("hex")}]`;
    assert.equal((await me.send("PATCH", "/users/me", { pushToken: token, prefs: { notifications: { dailySummary: true, weeklySummary: true, investmentReminder: true } } })).status, 200);
    const cat: Record<string, string> = {};
    for (const c of (await me.send("GET", "/categories")).json.data as { _id: string; name: string }[]) cat[c.name] = c._id;
    setClock("2026-06-01T06:00:00Z");
    const bank = await me.account("Bank", { startingBalance: 10_000_000 });
    const fund = await me.account("Index fund", { type: "investment", startingBalance: 0 });
    for (const m of ["03", "04", "05"]) await txn(me, "expense", 64_900, bank, `2026-${m}-20T06:30:00Z`, { category: cat.Subscriptions, title: "Netflix" });
    await txn(me, "income", 200_000, bank, "2026-05-01T06:30:00Z", { title: "Refund" });
    await txn(me, "expense", 100_000, bank, "2026-05-05T06:30:00Z", { category: cat.Shopping, title: "Shoes" });
    await txn(me, "expense", 20_000, bank, "2026-05-26T06:30:00Z", { category: cat.Groceries, title: "Veg" });
    await txn(me, "expense", 10_000, bank, "2026-05-31T06:30:00Z", { category: cat.Groceries, title: "Fruit" });
    await txn(me, "income", 5_000, bank, "2026-05-31T07:30:00Z", { title: "Cashback" });
    const bill = async (name: string, dueDate: string, extra: Record<string, unknown> = {}) => {
        const r = await me.send("POST", "/bills", { name, amount: 20_000, dueDate, recurring: false, ...extra });
        assert.equal(r.status, 201, r.text);
        ids[name] = r.json.data._id;
    };
    await bill("Phone", "2026-05-29T06:30:00Z");
    await bill("Water", "2026-06-01T06:30:00Z");
    await bill("Rent", "2026-06-03T06:30:00Z");
    await bill("SIP", "2026-06-02T06:30:00Z", { toInvestment: fund, category: null });
    await bill("Quiet", "2026-06-03T06:30:00Z", { reminderDays: 0 });
    await bill("Far", "2026-06-20T06:30:00Z");
    const goal = async (name: string, target: number, deadline: string, saved = 0) => {
        const g = await me.send("POST", "/goals", { name, target, deadline });
        assert.equal(g.status, 201, g.text);
        if (saved) await me.send("POST", `/goals/${g.json.data._id}/contribute`, { amount: saved });
        ids[name] = g.json.data._id;
    };
    await goal("Car", 500_000, "2026-06-05T06:30:00Z", 100_000);
    await goal("Fest", 10_000, "2026-06-01T10:00:00Z");
    await goal("Done", 10_000, "2026-06-03T06:30:00Z", 10_000);
    await goal("Later", 10_000, "2026-07-30T06:30:00Z");
    resetClock();
});

test("before 18:00 in the user's zone nothing is sent", async () => {
    // Only the milestone from funding Done, raised by the contribution itself.
    assert.deepEqual(await titles(me), ["Done is fully funded 🎉"]);
    await runReminders(new Date("2026-06-01T12:00:00Z"));
    assert.deepEqual(await titles(me), ["Done is fully funded 🎉"]);
});

test("18:15: bills, goal deadlines, recurring and yesterday's digest; not yet the weekly or monthly", async () => {
    const before = (await feed(me)).length;
    await runReminders(AT_1815);
    const rows = (await feed(me)).slice(before);
    const by = Object.fromEntries(rows.map((r) => [r.title, r]));
    assert.deepEqual(rows.map((r) => r.title).sort(), [
        "31 May in review", "Car is due in 4 days", "Fest is due today", "Netflix looks like a monthly payment",
        "Phone is overdue", "Rent due in 2 days", "SIP · invest in 1 day", "Water is due today",
    ]);
    assert.deepEqual([by["Phone is overdue"].type, by["Phone is overdue"].body, by["Phone is overdue"].dedupeKey], ["billOverdue", "₹200.00 was due 3 days ago.", `bill:${ids.Phone}:overdue:2026-05-29`]);
    assert.deepEqual([by["Water is due today"].body, by["Water is due today"].dedupeKey], ["₹200.00 due today.", `bill:${ids.Water}:today:2026-06-01`]);
    assert.deepEqual([by["Rent due in 2 days"].body, by["Rent due in 2 days"].dedupeKey], ["₹200.00 due on 3 Jun.", `bill:${ids.Rent}:due:2026-06-03`]);
    assert.equal(by["SIP · invest in 1 day"].body, "₹200.00 to invest on 2 Jun.");
    assert.deepEqual([by["Car is due in 4 days"].type, by["Car is due in 4 days"].body, by["Car is due in 4 days"].dedupeKey], ["goalDeadline", "₹4,000.00 still to go.", `goal:${ids.Car}:deadline:2026-06-05`]);
    assert.equal(by["Netflix looks like a monthly payment"].body, "Turn it into a bill to get reminded before it's due.");
    assert.deepEqual([by["31 May in review"].body, by["31 May in review"].dedupeKey], ["Spent ₹100.00, earned ₹50.00 — ₹50.00 more than you earned. 2 transactions.", "daily:2026-05-31"]);
    assert.ok(rows.every((r) => r.pushedAt instanceof Date), "every one pushed");
    assert.deepEqual(sentPushes.filter((p) => p.to === token).slice(-rows.length).map((p) => p.title).sort(), rows.map((r) => r.title).sort());
});

test("19:15 adds the weekly digest, 20:30 the monthly and the revalue nudge; a re-run sends nothing twice", async () => {
    const before = (await feed(me)).length;
    await runReminders(AT_1915);
    const weekly = (await feed(me)).slice(before);
    assert.deepEqual(weekly.map((r) => [r.title, r.body, r.dedupeKey]), [["Your week in review", "Spent ₹300.00, earned ₹50.00 — ₹250.00 more than you earned.", "weekly:2026-06-01"]]);

    await runReminders(AT_2030);
    const late = (await feed(me)).slice(before + 1);
    assert.deepEqual(late.map((r) => [r.type, r.title, r.body, r.dedupeKey]), [
        ["monthlySummary", "May in review", "Spent ₹1,949.00, earned ₹2,050.00 — ₹101.00 put aside. Most went to Shopping — ₹1,000.00.", "monthly:2026-05"],
        ["revalueInvestments", "Time to update your investments", "Update what your 1 investment is worth today to keep your net worth and returns accurate.", "revalue:2026-06"],
    ]);

    const total = (await feed(me)).length;
    const pushes = sentPushes.length;
    await runReminders(AT_2030);
    await runReminders(new Date("2026-06-01T17:00:00Z"));
    assert.equal((await feed(me)).length, total);
    assert.equal(sentPushes.length, pushes);
});

test("switched off, closed, or still morning where they are: nothing", async () => {
    setClock("2026-06-01T06:00:00Z");
    const make = async (tag: string) => {
        const u = await api.user(tag);
        const r = await u.send("POST", "/bills", { name: "Overdue", amount: 1_000, dueDate: "2026-05-20T06:30:00Z", recurring: false });
        assert.equal(r.status, 201, r.text);
        return u;
    };
    const off = await make("rem-off");
    assert.equal((await off.send("PATCH", "/users/me", { prefs: { notifications: { enabled: false } } })).status, 200);
    const closed = await make("rem-closed");
    assert.equal((await closed.send("DELETE", "/users/me")).status, 200);
    const ny = await make("rem-ny");
    assert.equal((await ny.send("PATCH", "/users/me", { prefs: { timeZone: "America/New_York" } })).status, 200);
    const digestsOff = await make("rem-digests");
    assert.equal((await digestsOff.send("PATCH", "/users/me", { prefs: { notifications: { monthlySummary: false, goalMilestones: false } } })).status, 200);
    resetClock();

    // 20:30 in Kolkata is 11:00 in New York.
    await runReminders(AT_2030);
    assert.deepEqual([await titles(off), await titles(closed), await titles(ny)], [[], [], []]);
    // Bill reminders have no switch of their own.
    assert.deepEqual(await titles(digestsOff), ["Overdue is overdue"]);
});

test("a recurring bill paid once while three months behind is still nudged as overdue (gaps row 10)", async () => {
    setClock("2026-06-01T06:00:00Z");
    const u = await api.user("rem-behind");
    const bank = await u.account("Bank", { startingBalance: 1_000_000 });
    const r = await u.send("POST", "/bills", { name: "Gym", amount: 1_000, dueDate: "2026-03-12T06:30:00Z", recurring: true, frequency: "monthly" });
    assert.equal(r.status, 201, r.text);
    assert.equal((await u.send("POST", `/bills/${r.json.data._id}/pay`, { account: bank })).status, 200);
    resetClock();

    await runReminders(AT_1815);
    assert.deepEqual(await titles(u), ["Gym is overdue"]);
});

test("the flow line: everyday spending, trips in their own clause, put aside counting both", () => {
    assert.equal(
        flowLine({ income: 1_20_000_00, expense: 86_090_20, tripExpense: 6_450_00, count: 3 }),
        "Spent ₹79,640.20 plus ₹6,450.00 on trips, earned ₹1,20,000.00 — ₹33,909.80 put aside.",
    );
    assert.equal(
        flowLine({ income: 0, expense: 6_450_00, tripExpense: 6_450_00, count: 1 }),
        "Spent ₹0.00 plus ₹6,450.00 on trips, earned ₹0.00 — ₹6,450.00 more than you earned.",
    );
    assert.equal(flowLine({ income: 1_20_000_00, expense: 86_090_20, tripExpense: 0, count: 2 }), "Spent ₹86,090.20, earned ₹1,20,000.00 — ₹33,909.80 put aside.");
});

test("digests read trip shares as trips, and a day spent only on a trip still gets one", async () => {
    setClock("2026-06-01T06:00:00Z");
    const make = async (tag: string) => {
        const u = await api.user(tag);
        assert.equal((await u.send("PATCH", "/users/me", { prefs: { notifications: { dailySummary: true } } })).status, 200);
        const bank = await u.account("Bank", { startingBalance: 1_00_00_000_00 });
        const ravi = await u.account("Ravi", { type: "person", startingBalance: 0 });
        return { u, bank, ravi };
    };
    const mixed = await make("rem-trips");
    await txn(mixed.u, "income", 1_20_000_00, mixed.bank, "2026-05-31T05:30:00Z", { title: "Salary" });
    await txn(mixed.u, "expense", 79_640_20, mixed.bank, "2026-05-31T06:30:00Z", { title: "Rent" });
    // Your ₹6,450.00 share of a ₹12,900.00 dinner; Ravi's half is a transfer, not spending.
    await tripWithExpense(mixed.u, [mixed.ravi], mixed.bank, 12_900_00, "2026-05-31T07:30:00Z");
    const tripOnly = await make("rem-trip-only");
    await tripWithExpense(tripOnly.u, [tripOnly.ravi], tripOnly.bank, 12_900_00, "2026-05-31T07:30:00Z");
    resetClock();

    await runReminders(AT_1815);
    const digest = async (u: TestUser) => (await feed(u)).find((r) => r.type === "dailySummary")?.body;
    assert.equal(await digest(mixed.u), "Spent ₹79,640.20 plus ₹6,450.00 on trips, earned ₹1,20,000.00 — ₹33,909.80 put aside. 3 transactions.");
    assert.equal(await digest(tripOnly.u), "Spent ₹0.00 plus ₹6,450.00 on trips, earned ₹0.00 — ₹6,450.00 more than you earned. 1 transaction.");
});
