import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { useTestApi, type TestUser } from "../harness";
import { failed, resetClock, setClock, txn, tripWithExpense } from "./readHelpers";
import { netWorthAtBoundaries, netWorthTrend } from "../../src/services/netWorthHistoryService";
import { healthScore } from "../../src/services/healthService";

// GET /dashboard/summary, /dashboard/health and /dashboard/insights, and the net-worth history
// behind them, with the clock frozen (readHelpers.setClock) so every figure is exact. Users are
// in Asia/Kolkata unless a test says otherwise. The 2.8.1 totals include your trip share, and
// the 2.8.4 `trip…` fields say how much of each is trips (D21). Net-worth history counts only
// the accounts today's figure counts (D24).

const api = useTestApi();
afterEach(resetClock);
after(resetClock);

// Wednesday 15 April 2026, 12:00 in Kolkata.
const NOW = "2026-04-15T06:30:00Z";

let me: TestUser;
let bank: string;
let card: string;
let wallet: string;
let asha: string;

before(async () => {
    await api.ready();
    setClock(NOW);
    me = await api.user("dash");
    bank = await me.account("Bank", { startingBalance: 5_000_000 });
    card = await me.account("Card", { type: "credit_card", startingBalance: 0 });
    wallet = await me.account("Wallet", { type: "wallet", startingBalance: 300_000 });
    asha = await me.account("Asha", { type: "person", startingBalance: 0 });
    await txn(me, "income", 3_000_000, bank, "2026-01-10T06:30:00Z", { title: "Salary" });
    await txn(me, "expense", 400_000, bank, "2026-02-05T06:30:00Z", { title: "Rent" });
    await txn(me, "positiveAdjustment", 50_000, bank, "2026-02-20T06:30:00Z");
    await txn(me, "transfer", 200_000, bank, "2026-03-10T06:30:00Z", { toAccount: card });
    await txn(me, "expense", 150_000, card, "2026-03-12T06:30:00Z", { title: "Shoes" });
    // One second either side of midnight on 1 April in Kolkata (18:30 UTC on the 31st).
    await txn(me, "expense", 100_000, bank, "2026-03-31T18:29:59Z", { title: "Late dinner" });
    await txn(me, "expense", 70_000, bank, "2026-03-31T18:30:00Z", { title: "Midnight snack" });
    await txn(me, "income", 1_000_000, bank, "2026-04-14T05:00:00Z", { title: "Bonus" });
    await txn(me, "negativeAdjustment", 10_000, bank, "2026-04-14T06:00:00Z");
    await txn(me, "expense", 30_000, wallet, "2026-04-13T06:30:00Z", { title: "Coffee" });
    // You paid 90,000 and Asha owes half: a 45,000 expense (your share) and a 45,000 transfer to her.
    await tripWithExpense(me, [asha], bank, 90_000, "2026-04-10T06:30:00Z");
    assert.equal((await me.send("DELETE", `/accounts/${wallet}`)).status, 200);
    resetClock();
});

// Balances now: bank 8,180,000, card 50,000, Asha 45,000; the archived wallet's 270,000 is left out.
const NET_WORTH = 8_275_000;

test("summary: this month's figures, cut at Kolkata midnight, trips and an archived account's rows included", async () => {
    setClock(NOW);
    const r = await me.send("GET", "/dashboard/summary");
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.message, "Dashboard summary fetched");
    const d = r.json.data;
    assert.deepEqual(
        { month: d.month, income: d.income, expenses: d.expenses, tripExpenses: d.tripExpenses, savings: d.savings, netWorth: d.netWorth },
        // April: the 00:00:00 snack 70,000 + the wallet's coffee 30,000 + the trip share 45,000,
        // of which the trip share is trips: everyday spending is 100,000. Savings count the trip.
        { month: "2026-04", income: 1_000_000, expenses: 145_000, tripExpenses: 45_000, savings: 855_000, netWorth: NET_WORTH },
    );
    // The week from Monday 13 April: the coffee and the bonus. Adjustments and transfers never count.
    // The trip dinner was on the 10th, last week.
    assert.deepEqual([d.weekIncome, d.weekExpense, d.weekTripExpense], [1_000_000, 30_000, 0]);
    assert.deepEqual(d.biggestExpense, { title: "Midnight snack", amount: 70_000, occurredAt: "2026-03-31T18:30:00.000Z" });
    // 14 and 13 April logged, today not yet: 2.
    assert.equal(d.currentStreak, 2);
    assert.equal("sinceLastOpened" in d, false);
});

test("summary: net-worth history walks back from today over the accounts today's figure counts (D24)", async () => {
    setClock(NOW);
    const d = (await me.send("GET", "/dashboard/summary")).json.data;
    // Month deltas on the live accounts (income − expense ± adjustments; transfers between them
    // net to zero): Feb −350,000, Mar −250,000, Apr +875,000. The archived wallet's −30,000
    // coffee is left out, as its balance is left out of today's figure; 2.8.1 counted it, which
    // put every past point 30,000 higher (8,030,000, 7,680,000, 7,430,000).
    assert.deepEqual(d.netWorthTrend, [
        { label: "Feb 2026", total: 8_000_000 },
        { label: "Mar 2026", total: 7_650_000 },
        { label: "Apr 2026", total: 7_400_000 },
        { label: "Apr 2026", total: NET_WORTH },
    ]);
    // Each point is the complete month before the boundary, then this month once, last. The flow
    // still counts every account's rows, the archived wallet's included, as `expenses` does.
    assert.deepEqual(d.flowTrend, [
        { label: "Jan 2026", income: 3_000_000, expense: 0, tripExpense: 0 },
        { label: "Feb 2026", income: 0, expense: 400_000, tripExpense: 0 },
        { label: "Mar 2026", income: 0, expense: 250_000, tripExpense: 0 },
        { label: "2026-04", income: 1_000_000, expense: 145_000, tripExpense: 45_000 },
    ]);
    assert.equal(d.flowTrend.length, d.netWorthTrend.length);
});

test("summary: flowTrend across a year end, cut at Kolkata midnight; one complete month gives two points", async () => {
    // Thursday 15 January 2026, noon in Kolkata.
    setClock("2026-01-15T06:30:00Z");
    const u = await api.user("dash-year");
    const b = await u.account("Bank", { startingBalance: 1_000_000 });
    // Each pair is one second either side of local midnight (18:30 UTC the day before).
    await txn(u, "expense", 1_000, b, "2025-09-30T18:29:59Z");
    await txn(u, "expense", 2_000, b, "2025-09-30T18:30:00Z");
    await txn(u, "income", 500_000, b, "2025-11-15T06:30:00Z");
    await txn(u, "expense", 30_000, b, "2025-12-31T18:29:59Z");
    await txn(u, "expense", 40_000, b, "2025-12-31T18:30:00Z");
    await txn(u, "income", 100_000, b, "2026-01-10T06:30:00Z");
    const d = (await u.send("GET", "/dashboard/summary")).json.data;
    // September's row is a fourth month back: outside the three.
    assert.deepEqual(d.flowTrend, [
        { label: "Oct 2025", income: 0, expense: 2_000, tripExpense: 0 },
        { label: "Nov 2025", income: 500_000, expense: 0, tripExpense: 0 },
        { label: "Dec 2025", income: 0, expense: 30_000, tripExpense: 0 },
        { label: "2026-01", income: 100_000, expense: 40_000, tripExpense: 0 },
    ]);
    assert.deepEqual(d.netWorthTrend, [
        { label: "Nov 2025", total: 997_000 },
        { label: "Dec 2025", total: 1_497_000 },
        { label: "Jan 2026", total: 1_467_000 },
        { label: "Jan 2026", total: 1_527_000 },
    ]);

    const v = await api.user("dash-year-young");
    const vb = await v.account("Bank", { startingBalance: 100_000 });
    await txn(v, "expense", 5_000, vb, "2025-12-20T06:30:00Z");
    await txn(v, "expense", 7_000, vb, "2026-01-05T06:30:00Z");
    const y = (await v.send("GET", "/dashboard/summary")).json.data;
    assert.deepEqual(y.flowTrend, [{ label: "Dec 2025", income: 0, expense: 5_000, tripExpense: 0 }, { label: "2026-01", income: 0, expense: 7_000, tripExpense: 0 }]);
    assert.deepEqual(y.netWorthTrend, [{ label: "Jan 2026", total: 95_000 }, { label: "Jan 2026", total: 88_000 }]);
});

test("summary: a past month and `since`; the history still ends today", async () => {
    setClock(NOW);
    const r = await me.send("GET", "/dashboard/summary?month=2026-03&since=2026-04-13T00:00:00Z");
    assert.equal(r.status, 200, r.text);
    const d = r.json.data;
    // March: shoes 150,000 + the 23:59:59 dinner 100,000.
    assert.deepEqual([d.month, d.income, d.expenses, d.savings], ["2026-03", 0, 250_000, -250_000]);
    assert.deepEqual(d.biggestExpense, { title: "Shoes", amount: 150_000, occurredAt: "2026-03-12T06:30:00.000Z" });
    assert.deepEqual(d.sinceLastOpened, { transactions: 1, spent: 30_000 });
    assert.equal(d.netWorth, NET_WORTH);
    assert.deepEqual(d.flowTrend.at(-1), { label: "2026-03", income: 0, expense: 250_000, tripExpense: 0 });
    assert.equal(d.tripExpenses, 0);
    // The week is always this week.
    assert.deepEqual([d.weekIncome, d.weekExpense], [1_000_000, 30_000]);
});

test("summary: the user's zone decides the month, not UTC or the phone", async () => {
    setClock(NOW);
    const u = await api.user("dash-ny");
    const b = await u.account("Bank", { startingBalance: 1_000_000 });
    await txn(u, "expense", 100_000, b, "2026-03-31T18:29:59Z");
    await txn(u, "expense", 70_000, b, "2026-03-31T18:30:00Z");
    await txn(u, "expense", 5_000, b, "2026-04-01T04:30:00Z");
    const april = async () => (await u.send("GET", "/dashboard/summary")).json.data.expenses;
    assert.equal(await april(), 75_000, "Kolkata: both 18:30 UTC rows and later are April");
    assert.equal((await u.send("PATCH", "/users/me", { prefs: { timeZone: "America/New_York" } })).status, 200);
    // New York: 18:30 UTC on 31 March is still 14:30 on the 31st, and 04:30 UTC on 1 April is 00:30 on the 1st.
    assert.equal(await april(), 5_000);
});

test("summary: a new account has one net-worth point and only this month's flow", async () => {
    setClock(NOW);
    const u = await api.user("dash-new");
    const empty = (await u.send("GET", "/dashboard/summary")).json.data;
    assert.deepEqual(empty, {
        month: "2026-04", income: 0, expenses: 0, tripExpenses: 0, savings: 0, netWorth: 0,
        netWorthTrend: [{ label: "2026-04", total: 0 }],
        flowTrend: [{ label: "2026-04", income: 0, expense: 0, tripExpense: 0 }],
        currentStreak: 0, weekIncome: 0, weekExpense: 0, weekTripExpense: 0, biggestExpense: null,
    });
    const b = await u.account("Bank", { startingBalance: 200_000 });
    await txn(u, "expense", 20_000, b, "2026-04-15T05:00:00Z");
    const young = (await u.send("GET", "/dashboard/summary")).json.data;
    assert.deepEqual(young.netWorthTrend, [{ label: "Apr 2026", total: 180_000 }]);
    assert.deepEqual(young.flowTrend, [{ label: "2026-04", income: 0, expense: 20_000, tripExpense: 0 }]);
    assert.equal(young.currentStreak, 1);
});

test("summary (D21): this week's and this month's trip shares, inside the 2.8.1 totals", async () => {
    setClock(NOW);
    const u = await api.user("dash-trip-week");
    const b = await u.account("Bank", { startingBalance: 1_000_000 });
    const ravi = await u.account("Ravi", { type: "person", startingBalance: 0 });
    await txn(u, "expense", 12_345, b, "2026-04-14T06:30:00Z");
    // 30,000 split with Ravi on Monday 13 April: your 15,000 share.
    await tripWithExpense(u, [ravi], b, 30_000, "2026-04-13T06:30:00Z");
    const d = (await u.send("GET", "/dashboard/summary")).json.data;
    assert.deepEqual([d.expenses, d.tripExpenses, d.weekExpense, d.weekTripExpense], [27_345, 15_000, 27_345, 15_000]);
    // Everyday spending is what is left: 12,345. Savings still count the trip.
    assert.equal(d.savings, -27_345);
    assert.deepEqual(d.flowTrend.at(-1), { label: "2026-04", income: 0, expense: 27_345, tripExpense: 15_000 });
});

test("summary: bad query is 400 invalid_input; unknown parameters are dropped; signed out is 401", async () => {
    setClock(NOW);
    failed(await me.send("GET", "/dashboard/summary?month=2026-13"), 400, "invalid_input");
    failed(await me.send("GET", "/dashboard/summary?month=April"), 400, "invalid_input");
    failed(await me.send("GET", "/dashboard/summary?since=yesterday"), 400, "invalid_input");
    // `z.iso.datetime()` without `offset`: only the Z form.
    failed(await me.send("GET", "/dashboard/summary?since=2026-04-13T00:00:00%2B05:30"), 400, "invalid_input");
    assert.equal((await me.send("GET", "/dashboard/summary?utm=x")).status, 200);
    for (const p of ["/dashboard/summary", "/dashboard/health", "/dashboard/insights"]) {
        failed(await api.send("GET", p), 401, "unauthenticated", "Please sign in again");
        failed(await api.send("GET", p, undefined, { token: "not-a-jwt" }), 401, "unauthenticated");
    }
});

test("summary: another user sees none of this user's money", async () => {
    setClock(NOW);
    const other = await api.user("dash-other");
    const d = (await other.send("GET", "/dashboard/summary")).json.data;
    assert.deepEqual([d.income, d.expenses, d.netWorth, d.biggestExpense, d.currentStreak], [0, 0, 0, null, 0]);
    const h = (await other.send("GET", "/dashboard/health")).json.data;
    assert.equal(h.score, null);
});

// ---- Net-worth history, straight from the service ----------------------------------------------

test("netWorthTrend: capped at three boundaries, and none before the first row", async () => {
    const oid = new mongoose.Types.ObjectId(me.id);
    const full = await netWorthTrend(oid, "Asia/Kolkata", new Date("2026-07-15T06:30:00Z"), NET_WORTH, new Date("2026-01-10T06:30:00Z"));
    assert.deepEqual(full.points.map((p) => p.label), ["May 2026", "Jun 2026", "Jul 2026", "Jul 2026"]);
    // Nothing moved after April, so every boundary from May on is today's total.
    assert.deepEqual(full.points.map((p) => p.total), [NET_WORTH, NET_WORTH, NET_WORTH, NET_WORTH]);
    const short = await netWorthTrend(oid, "Asia/Kolkata", new Date("2026-02-15T06:30:00Z"), NET_WORTH, new Date("2026-01-10T06:30:00Z"));
    assert.deepEqual(short.points.map((p) => p.label), ["Feb 2026", "Feb 2026"]);
});

test("netWorthAtBoundaries: a month's opening and closing net worth; null before the first row", async () => {
    const oid = new mongoose.Types.ObjectId(me.id);
    const marchStart = new Date("2026-02-28T18:30:00Z");
    const aprilStart = new Date("2026-03-31T18:30:00Z");
    const decStart = new Date("2025-11-30T18:30:00Z");
    assert.deepEqual(
        await netWorthAtBoundaries(oid, "Asia/Kolkata", NET_WORTH, new Date("2026-01-10T06:30:00Z"), [decStart, marchStart, aprilStart]),
        [null, 7_650_000, 7_400_000],
    );
});

test("net-worth history (D24): an archived account's own rows and its transfers' far legs drop out", async () => {
    setClock(NOW);
    const u = await api.user("dash-archived");
    const b = await u.account("Bank", { startingBalance: 1_000_000 });
    const old = await u.account("Old savings", { startingBalance: 500_000 });
    await txn(u, "transfer", 200_000, old, "2026-03-05T06:30:00Z", { toAccount: b });
    await txn(u, "expense", 50_000, old, "2026-03-10T06:30:00Z");
    await txn(u, "transfer", 100_000, b, "2026-04-02T06:30:00Z", { toAccount: old });
    await txn(u, "income", 300_000, b, "2026-04-03T06:30:00Z");
    assert.equal((await u.send("DELETE", `/accounts/${old}`)).status, 200);

    // Today: Bank 1,400,000; the archived account's 350,000 is left out.
    const d = (await u.send("GET", "/dashboard/summary")).json.data;
    assert.equal(d.netWorth, 1_400_000);
    // Bank on 1 April was 1,200,000: April moved it −100,000 (the transfer out) + 300,000.
    // 2.8.1 skipped transfers and gave 1,100,000.
    assert.deepEqual(d.netWorthTrend, [{ label: "Apr 2026", total: 1_200_000 }, { label: "Apr 2026", total: 1_400_000 }]);

    // On 1 March, Bank's 1,000,000: March brought in the 200,000 transfer; the archived account's
    // 50,000 expense never touched it. 2.8.1 counted the expense and not the transfer: 1,150,000.
    const marchStart = new Date("2026-02-28T18:30:00Z");
    const aprilStart = new Date("2026-03-31T18:30:00Z");
    assert.deepEqual(
        await netWorthAtBoundaries(new mongoose.Types.ObjectId(u.id), "Asia/Kolkata", 1_400_000, new Date("2026-02-01T00:00:00Z"), [marchStart, aprilStart]),
        [1_000_000, 1_200_000],
    );
});

// ---- Health -----------------------------------------------------------------------------------

test("health: scored on the 90 days before today; January's salary has left the window", async () => {
    setClock(NOW);
    const r = await me.send("GET", "/dashboard/health");
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.message, "Health score fetched");
    // Income 1,000,000 against 795,000 spent: 20.5% saved. 8,180,000 liquid over 265,000 a month.
    assert.deepEqual(r.json.data, {
        score: 90, band: "excellent", rating: "Excellent", windowDays: 90,
        pillars: [
            { key: "savings", label: "Savings rate", score: 81, weight: 30, value: "20.5%", verdict: "On track" },
            { key: "buffer", label: "Safety buffer", score: 100, weight: 25, value: "6+ months", verdict: "On track" },
        ],
        runwayMonths: 8_180_000 / 265_000,
    });
});

test("health: no score with no rows, under 30 days, or nothing scorable", async () => {
    setClock("2026-05-30T06:30:00Z");
    const u = await api.user("health-gate");
    const none = (await u.send("GET", "/dashboard/health")).json.data;
    assert.deepEqual(none, { score: null, band: "unknown", rating: "Not enough data", windowDays: 90, pillars: [], reason: "Log a few transactions and your score will appear here.", runwayMonths: null });

    const b = await u.account("Bank", { startingBalance: 100_000 });
    const c = await u.account("Cash", { type: "cash", startingBalance: 0 });
    await txn(u, "transfer", 1_000, b, "2026-05-01T06:30:00Z", { toAccount: c });
    assert.equal((await u.send("GET", "/dashboard/health")).json.data.reason,
        "1 more day of history and your score will appear. A verdict on two weeks of spending would not be worth much.");
    setClock("2026-05-29T06:30:00Z");
    assert.match((await u.send("GET", "/dashboard/health")).json.data.reason, /^2 more days of history/);
    // 30 days in, but a transfer is neither income nor spending, and there are no bills, budgets or goals.
    setClock("2026-05-31T06:30:00Z");
    const idle = (await u.send("GET", "/dashboard/health")).json.data;
    assert.deepEqual([idle.score, idle.band, idle.reason], [null, "unknown", "There isn't enough activity yet to score."]);
});

test("health: every pillar failing, with its hint, and the focus on the heaviest", async () => {
    // Saturday 20 June 2026, noon in Kolkata.
    setClock("2026-06-20T06:30:00Z");
    const u = await api.user("health-bad");
    const food = await u.category("expense");
    const b = await u.account("Bank", { startingBalance: 100_000 });
    const cc = await u.account("Card", { type: "credit_card", startingBalance: 0 });
    await txn(u, "income", 1_000_000, b, "2026-04-01T06:30:00Z");
    await txn(u, "expense", 1_200_000, cc, "2026-05-10T06:30:00Z");
    await txn(u, "expense", 150_000, b, "2026-06-05T06:30:00Z", { category: food });
    assert.equal((await u.send("POST", "/budgets", { category: food, month: "2026-06", limit: 100_000 })).status, 201);
    const bill = (name: string, dueDate: string, recurring: boolean) => u.send("POST", "/bills", { name, amount: 50_000, dueDate, recurring, ...(recurring ? { frequency: "monthly" } : {}), category: food });
    assert.equal((await bill("Rent", "2026-06-10T06:30:00Z", false)).status, 201);
    assert.equal((await bill("Internet", "2026-06-25T06:30:00Z", true)).status, 201);
    const car = await u.send("POST", "/goals", { name: "Car", target: 1_200_000, deadline: "2026-12-20T06:30:00Z" });
    const phone = await u.send("POST", "/goals", { name: "Phone", target: 10_000, deadline: "2026-08-01T06:30:00Z" });
    assert.deepEqual([car.status, phone.status], [201, 201]);
    assert.equal((await u.send("POST", `/goals/${phone.json.data._id}/contribute`, { amount: 10_000 })).status, 200);
    const foodName = ((await u.send("GET", "/categories")).json.data as { _id: string; name: string }[]).find((c) => c._id === food)!.name;

    const d = (await u.send("GET", "/dashboard/health")).json.data;
    const by = Object.fromEntries((d.pillars as { key: string }[]).map((p) => [p.key, p]));
    assert.deepEqual(d.pillars.map((p: { key: string }) => p.key), ["savings", "buffer", "bills", "budgets", "goals"]);
    assert.deepEqual(by.savings, { key: "savings", label: "Savings rate", score: 0, weight: 30, value: "−35.0%", verdict: "Off track",
        hint: "You are spending more than you earn over the last 90 days. Everything else on this list depends on closing that gap first." });
    assert.deepEqual(by.buffer, { key: "buffer", label: "Safety buffer", score: 0, weight: 25, value: "0.0 months", verdict: "Off track",
        hint: "₹12,000.00 on cards is eating most of your buffer. Clearing it lifts this faster than saving more does." });
    // Rent 10 days late, 1 of 2: 50 − 10.
    assert.deepEqual(by.bills, { key: "bills", label: "Bills", score: 40, weight: 20, value: "1 of 2 late", verdict: "Watch",
        hint: "Rent is 10 days overdue. This is the quickest thing on the list to fix." });
    // 150,000 against 20/30 of 100,000.
    assert.deepEqual(by.budgets, { key: "budgets", label: "Budgets", score: 0, weight: 15, value: "1 of 1 over", verdict: "Off track",
        hint: `${foodName} is running at 225.0% of its pace for this point in the month. Either the limit is wrong or the spending is — both are worth knowing.` });
    // Phone done (100), Car at 0 of pace, weighted by target: 1,000,000 / 1,210,000.
    assert.deepEqual(by.goals, { key: "goals", label: "Goals", score: 1, weight: 10, value: "1.0% of pace", verdict: "Off track",
        // 1,200,000 over 183 days (6.1 months) is 196,721.3 paise a month.
        hint: "Car needs about ₹1,967.21 a month to land by Dec 2026. You have been adding roughly ₹0.00." });
    // (40 × 20 + 1 × 10) / 100 = 8.1.
    assert.deepEqual([d.score, d.band, d.rating, d.runwayMonths], [8, "risk", "At risk", 0]);
    assert.deepEqual(d.focus, { key: "savings", label: "Savings rate", hint: by.savings.hint });
});

test("health: a failing pillar caps the total at 79 however strong the rest", async () => {
    setClock("2026-06-20T06:30:00Z");
    const u = await api.user("health-cap");
    const food = await u.category("expense");
    const b = await u.account("Bank", { startingBalance: 50_000_000 });
    await txn(u, "income", 1_000_000, b, "2026-04-01T06:30:00Z");
    const other = ((await u.send("GET", "/categories")).json.data as { _id: string; kind: string; parent?: string | null }[])
        .find((c) => c.kind === "expense" && !c.parent && c._id !== food)!._id;
    await txn(u, "expense", 100_000, b, "2026-05-01T06:30:00Z", { category: other });
    assert.equal((await u.send("POST", "/budgets", { category: food, month: "2026-06", limit: 100_000 })).status, 201);
    assert.equal((await u.send("POST", "/bills", { name: "Insurance", amount: 50_000, dueDate: "2026-05-01T06:30:00Z", recurring: false })).status, 201);
    const g = await u.send("POST", "/goals", { name: "Trip", target: 1_000_000, deadline: "2026-08-20T06:30:00Z" });
    assert.equal((await u.send("POST", `/goals/${g.json.data._id}/contribute`, { amount: 500_000 })).status, 200);

    const d = (await u.send("GET", "/dashboard/health")).json.data;
    assert.deepEqual(d.pillars.map((p: { key: string; score: number }) => [p.key, p.score]),
        [["savings", 100], ["buffer", 100], ["bills", 0], ["budgets", 100], ["goals", 100]]);
    // The weighted average is 80; the 50-day-late bill holds the headline under Excellent.
    assert.deepEqual([d.score, d.band, d.rating], [79, "good", "Good"]);
    assert.equal(d.focus.key, "bills");
    assert.match(d.focus.hint, /^Insurance is 50 days overdue/);
});

test("health: a mid-range saver gets the target hint; a thin buffer without card debt gets the floor hint", async () => {
    setClock("2026-06-20T06:30:00Z");
    const u = await api.user("health-mid");
    const b = await u.account("Bank", { startingBalance: 0 });
    await txn(u, "income", 3_000_000, b, "2026-04-01T06:30:00Z");
    await txn(u, "expense", 2_850_000, b, "2026-04-02T06:30:00Z");
    // 5% kept, 150,000 on hand against 950,000 a month.
    const d = await healthScore(u.id, "Asia/Kolkata", new Date("2026-06-20T06:30:00Z"));
    assert.deepEqual(d.pillars.map((p) => [p.key, p.score, p.value, p.hint]), [
        // The 20% target is a fixed rule of thumb, not a measured figure, so it keeps its whole number.
        ["savings", 25, "5.0%", "Keeping 5.0% of what comes in. The usual target is 20% — about ₹2,000.00 a month at your income."],
        ["buffer", 6, "0.2 months", "₹1,500.00 on hand covers 0.2 months. Three months of your own expenses — about ₹28,500.00 — is the usual floor."],
    ]);
});

// ---- For You and pace ---------------------------------------------------------------------------

test("insights: no-spend days, the weekday heatmap and pace against the last three months", async () => {
    setClock(NOW);
    const r = await me.send("GET", "/dashboard/insights");
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.message, "Dashboard insights fetched");
    const { forYou, pace } = r.json.data;
    assert.equal(forYou.goalWatch, null);
    // Expenses on 1, 10 and 13 April: 12 of 15 days without.
    assert.equal(forYou.noSpendDays, 12);
    assert.deepEqual(forYou.weekdayHeatmap.map((c: { day: string; total: number }) => [c.day, c.total]),
        [["Mon", 30_000], ["Tue", 0], ["Wed", 70_000], ["Thu", 0], ["Fri", 45_000], ["Sat", 0], ["Sun", 0]]);
    assert.equal(forYou.weekdayHeatmap[2].intensity, 1);
    assert.equal(forYou.weekdayHeatmap[0].intensity, 30_000 / 70_000);

    assert.equal(pace.monthsAveraged, 3);
    assert.equal(pace.current.length, 15);
    assert.deepEqual(pace.current.filter((p: { amount: number }) => p.amount > 0),
        [{ date: "2026-04-01", amount: 70_000 }, { date: "2026-04-10", amount: 45_000 }, { date: "2026-04-13", amount: 30_000 }]);
    // January, February, March: rent on the 5th over 3 months, shoes on the 12th over 3, and the
    // 31st's dinner over the 2 of them that have a 31st, labelled past April's 30 days.
    assert.equal(pace.average.length, 31);
    assert.deepEqual(pace.average.filter((p: { amount: number }) => p.amount > 0),
        [{ date: "2026-04-05", amount: 133_333 }, { date: "2026-04-12", amount: 50_000 }, { date: "day-31", amount: 50_000 }]);
});

test("insights: the goal closest to finishing at its own pace", async () => {
    const u = await api.user("dash-goals");
    const goal = async (name: string, target: number, saved: number, deadline?: string) => {
        const g = await u.send("POST", "/goals", { name, target, ...(deadline ? { deadline } : {}) });
        assert.equal(g.status, 201, g.text);
        if (saved) assert.equal((await u.send("POST", `/goals/${g.json.data._id}/contribute`, { amount: saved })).status, 200);
    };
    setClock("2026-02-10T06:30:00Z");
    await goal("Laptop", 1_000_000, 300_000);
    setClock(NOW);
    await goal("Bike", 1_000_000, 100_000, "2026-12-01T00:00:00Z");
    await goal("Done", 50_000, 50_000);
    await goal("Untouched", 50_000, 0);
    const { forYou, pace } = (await u.send("GET", "/dashboard/insights")).json.data;
    // Laptop: 300,000 over 2 months, 700,000 to go: 5 months. Bike: 100,000 a month: 9.
    assert.deepEqual(forYou.goalWatch, { goalName: "Laptop", monthsNeeded: 5, projectedDate: "2026-09-15T06:30:00.000Z", saved: 300_000, target: 1_000_000 });
    assert.equal(pace, null, "no transactions, no pace");
});

test("insights: under 5 days in, no counts; under 14, no heatmap; under a month old, no pace", async () => {
    setClock("2026-04-03T06:30:00Z");
    const u = await api.user("dash-early");
    const b = await u.account("Bank", { startingBalance: 100_000 });
    await txn(u, "expense", 1_000, b, "2026-04-02T06:30:00Z");
    assert.deepEqual((await u.send("GET", "/dashboard/insights")).json.data, { forYou: { goalWatch: null, noSpendDays: null, weekdayHeatmap: null }, pace: null });
    setClock("2026-04-09T06:30:00Z");
    assert.deepEqual((await u.send("GET", "/dashboard/insights")).json.data.forYou, { goalWatch: null, noSpendDays: 8, weekdayHeatmap: null });
});
