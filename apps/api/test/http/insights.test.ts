import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { useTestApi, type TestUser } from "../harness";
import { MISSING, failed, resetClock, setClock, tripWithExpense, txn } from "./readHelpers";

// GET /insights and GET /insights/category/:id with the clock frozen at Wednesday 15 April 2026,
// noon in Kolkata. Trip spending is one Trips slice in the breakdown and is left out of a
// category's own figures; every other 2.8.1 figure includes it. The 2.8.4 fields (D21) split it
// out: `tripExpense` per bucket, and shares of everyday spending.

const api = useTestApi();
afterEach(resetClock);
after(resetClock);

const NOW = "2026-04-15T06:30:00Z";
let me: TestUser;
const cat: Record<string, string> = {};
let bank: string;
let card: string;
let friend: string;
let tripId: string;

before(async () => {
    await api.ready();
    setClock(NOW);
    me = await api.user("insights");
    for (const c of (await me.send("GET", "/categories")).json.data as { _id: string; name: string }[]) cat[c.name] = c._id;
    const hobby = await me.send("POST", "/categories", { name: "Old Hobby", kind: "expense" });
    cat["Old Hobby"] = hobby.json.data._id;
    bank = await me.account("Bank", { startingBalance: 10_000_000 });
    card = await me.account("Card", { type: "credit_card", startingBalance: 0 });
    friend = await me.account("Ravi", { type: "person", startingBalance: 0 });
    const spend = (amount: number, category: string, at: string, account = bank) => txn(me, "expense", amount, account, at, { category: cat[category], title: category });

    await txn(me, "income", 500_000, bank, "2026-03-01T06:30:00Z");
    await spend(60_000, "Groceries", "2026-03-10T06:30:00Z");
    await spend(300_000, "Shopping", "2026-03-11T06:30:00Z");
    await spend(25_000, "Healthcare", "2026-03-12T06:30:00Z");
    await spend(1_000, "Restaurants", "2026-03-31T18:29:59Z");

    await txn(me, "income", 1_000_000, bank, "2026-04-01T06:30:00Z");
    await spend(2_000, "Restaurants", "2026-03-31T18:30:00Z");
    await spend(120_000, "Groceries", "2026-04-02T06:30:00Z");
    await spend(30_000, "Restaurants", "2026-04-03T06:30:00Z", card);
    await spend(50_000, "Food & Dining", "2026-04-05T06:30:00Z");
    await spend(200_000, "Shopping", "2026-04-06T06:30:00Z");
    await spend(300_000, "Others", "2026-04-07T06:30:00Z");
    await spend(10_000, "Old Hobby", "2026-04-08T06:30:00Z");
    await txn(me, "transfer", 100_000, bank, "2026-04-10T06:30:00Z", { toAccount: card });
    await txn(me, "negativeAdjustment", 5_000, bank, "2026-04-10T07:30:00Z");
    // Ravi paid 80,000 for dinner on the trip; your 40,000 share is charged to him, under Food.
    const trip = await me.send("POST", "/trips", { name: "Goa", startDate: "2026-04-09", endDate: "2026-04-09", members: [friend], budget: null });
    tripId = trip.json.data._id;
    const e = await me.send("POST", `/trips/${tripId}/expenses`, { title: "Dinner", occurredAt: "2026-04-09T06:30:00Z", category: cat["Food & Dining"], cost: 80_000, paidBy: friend, paidFrom: null, shares: [{ account: null, amount: 40_000 }, { account: friend, amount: 40_000 }] });
    assert.equal(e.status, 201, e.text);
    assert.equal((await me.send("DELETE", `/categories/${cat["Old Hobby"]}`)).status, 200);
    resetClock();
});

const APRIL_SPEND = 752_000;

test("insights: this month's breakdown rolls children into their parent and trips into one slice", async () => {
    setClock(NOW);
    const r = await me.send("GET", "/insights");
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.message, "Insights fetched");
    const d = r.json.data;
    assert.deepEqual([d.period, d.timeZone, d.periodStart, d.periodEnd], ["month", "Asia/Kolkata", "2026-03-31T18:30:00.000Z", "2026-04-30T18:30:00.000Z"]);
    // `share` divides by everyday spending, 712,000 (752,000 less the 40,000 trip share), so the
    // everyday slices add up to 100.0; the Trips slice has none.
    assert.deepEqual(d.byCategory, [
        { categoryId: cat.Others, name: "Others", total: 300_000, share: 42.1 },
        { categoryId: cat["Food & Dining"], name: "Food & Dining", total: 202_000, share: 28.4, children: [
            { categoryId: cat.Groceries, name: "Groceries", total: 120_000 },
            { categoryId: cat.Restaurants, name: "Restaurants", total: 32_000 },
        ] },
        { categoryId: cat.Shopping, name: "Shopping", total: 200_000, share: 28.1 },
        { categoryId: "trips", name: "Trips", total: 40_000, children: [{ categoryId: tripId, name: "Goa", total: 40_000 }] },
        // Archived since, and still named.
        { categoryId: cat["Old Hobby"], name: "Old Hobby", total: 10_000, share: 1.4 },
    ]);
    assert.deepEqual(d.uncategorised, { total: 0, share: 0 });
    assert.equal(d.topCategory, "Food & Dining", "Others is never the top category");
    // Ordered by how much each moved; Healthcare had spend only in March.
    assert.deepEqual(d.categoryCompare.map((c: { name: string; current: number; previous: number }) => [c.name, c.current, c.previous]), [
        ["Others", 300_000, 0], ["Food & Dining", 202_000, 61_000], ["Shopping", 200_000, 300_000],
        ["Trips", 40_000, 0], ["Healthcare", 0, 25_000], ["Old Hobby", 10_000, 0],
    ]);
    assert.deepEqual(d.byAccount, [
        { accountId: bank, name: "Bank", total: 682_000 },
        { accountId: "friends", name: "Paid by friends", total: 40_000 },
        { accountId: card, name: "Card", total: 30_000 },
    ]);
});

test("insights: trend, averages and counts include trips; transfers and adjustments never count", async () => {
    setClock(NOW);
    const d = (await me.send("GET", "/insights?period=month&offset=0")).json.data;
    // 1 to 15 April, stopping today.
    assert.equal(d.trend.length, 15);
    assert.deepEqual(d.trend.filter((p: { amount: number }) => p.amount), [
        { date: "2026-04-01", amount: 2_000 }, { date: "2026-04-02", amount: 120_000 }, { date: "2026-04-03", amount: 30_000 },
        { date: "2026-04-05", amount: 50_000 }, { date: "2026-04-06", amount: 200_000 }, { date: "2026-04-07", amount: 300_000 },
        { date: "2026-04-08", amount: 10_000 }, { date: "2026-04-09", amount: 40_000 },
    ]);
    assert.equal(d.trend.reduce((s: number, p: { amount: number }) => s + p.amount, 0), APRIL_SPEND);
    // March in full, the 23:59:59 row on the 31st.
    assert.equal(d.previousTrend.length, 31);
    assert.deepEqual(d.previousTrend.at(-1), { date: "2026-03-31", amount: 1_000 });
    assert.equal(d.avgDailySpendCurrent, Math.round(APRIL_SPEND / 15));
    assert.equal(d.avgDailySpendPrevious, Math.round(386_000 / 31));
    assert.equal(d.txnCount, 9);
    // `expense` keeps the trip share; `tripExpense` says how much of it that is.
    assert.deepEqual(d.incomeVsExpense, [
        { periodStart: "2025-11-01", income: 0, expense: 0, tripExpense: 0 }, { periodStart: "2025-12-01", income: 0, expense: 0, tripExpense: 0 },
        { periodStart: "2026-01-01", income: 0, expense: 0, tripExpense: 0 }, { periodStart: "2026-02-01", income: 0, expense: 0, tripExpense: 0 },
        { periodStart: "2026-03-01", income: 500_000, expense: 386_000, tripExpense: 0 }, { periodStart: "2026-04-01", income: 1_000_000, expense: APRIL_SPEND, tripExpense: 40_000 },
    ]);
});

test("insights: last month, a year, a week, a day; an empty period is all zeros", async () => {
    setClock(NOW);
    const march = (await me.send("GET", "/insights?offset=-1")).json.data;
    assert.equal(march.periodStart, "2026-02-28T18:30:00.000Z");
    assert.equal(march.trend.length, 31, "a finished month isn't cut short");
    assert.equal(march.avgDailySpendCurrent, Math.round(386_000 / 31));
    assert.deepEqual(march.byCategory.map((c: { name: string; total: number }) => [c.name, c.total]), [["Shopping", 300_000], ["Food & Dining", 61_000], ["Healthcare", 25_000]]);
    assert.equal(march.topCategory, "Shopping");

    const year = (await me.send("GET", "/insights?period=year")).json.data;
    assert.deepEqual(year.trend, [{ date: "2026-01", amount: 0 }, { date: "2026-02", amount: 0 }, { date: "2026-03", amount: 386_000 }, { date: "2026-04", amount: APRIL_SPEND }]);
    assert.equal(year.incomeVsExpense.at(-1).periodStart, "2026-01-01");

    // Monday 13 April onward: nothing spent.
    const week = (await me.send("GET", "/insights?period=week")).json.data;
    assert.deepEqual(week.trend, [{ date: "2026-04-13", amount: 0 }, { date: "2026-04-14", amount: 0 }, { date: "2026-04-15", amount: 0 }]);
    assert.deepEqual([week.byCategory, week.topCategory, week.txnCount, week.avgDailySpendCurrent], [[], null, 0, 0]);
    // 6 to 12 April: shopping, others, the hobby and the trip share.
    assert.equal(week.previousTrend.reduce((s: number, p: { amount: number }) => s + p.amount, 0), 550_000);
    assert.deepEqual(week.incomeVsExpense.map((w: { periodStart: string }) => w.periodStart), ["2026-03-09", "2026-03-16", "2026-03-23", "2026-03-30", "2026-04-06", "2026-04-13"]);

    // Today, hour by hour up to noon.
    const day = (await me.send("GET", "/insights?period=day")).json.data;
    assert.equal(day.trend.length, 13);
    assert.deepEqual([day.trend[0].date, day.trend.at(-1).date], ["2026-04-15T00", "2026-04-15T12"]);
    assert.equal(day.previousTrend.length, 24);

    const empty = (await me.send("GET", "/insights?offset=-12")).json.data;
    assert.deepEqual([empty.byCategory, empty.categoryCompare, empty.byAccount, empty.topCategory, empty.txnCount, empty.avgDailySpendCurrent, empty.avgDailySpendPrevious],
        [[], [], [], null, 0, 0, 0]);
    assert.equal(empty.trend.every((p: { amount: number }) => p.amount === 0), true);
});

test("category: a parent's own spend plus its children, trips left out", async () => {
    setClock(NOW);
    const r = await me.send("GET", `/insights/category/${cat["Food & Dining"]}`);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.message, "Category insights fetched");
    const { trend, ...d } = r.json.data;
    assert.deepEqual(d, {
        categoryId: cat["Food & Dining"], name: "Food & Dining", period: "month", timeZone: "Asia/Kolkata",
        periodStart: "2026-03-31T18:30:00.000Z", periodEnd: "2026-04-30T18:30:00.000Z",
        total: 202_000, previousTotal: 61_000,
        // The 2.8.1 field divides by all spend, trip share included; the 2.8.4 one by everyday spend.
        shareOfSpend: (202_000 / APRIL_SPEND) * 100,
        shareOfEverydaySpend: (202_000 / 712_000) * 100,
        txnCount: 4,
        children: [{ categoryId: cat.Groceries, name: "Groceries", total: 120_000 }, { categoryId: cat.Restaurants, name: "Restaurants", total: 32_000 }],
    });
    assert.equal(trend.length, 15);
    assert.deepEqual(trend.filter((p: { amount: number }) => p.amount), [
        { date: "2026-04-01", amount: 2_000 }, { date: "2026-04-02", amount: 120_000 }, { date: "2026-04-03", amount: 30_000 }, { date: "2026-04-05", amount: 50_000 },
    ]);
});

test("category: a sub-category names its parent; an archived one still answers; an empty window is zeros", async () => {
    setClock(NOW);
    const g = (await me.send("GET", `/insights/category/${cat.Groceries}?period=month&offset=0`)).json.data;
    assert.deepEqual([g.name, g.parentName, g.total, g.previousTotal, g.txnCount, g.children], ["Groceries", "Food & Dining", 120_000, 60_000, 1, []]);
    const old = (await me.send("GET", `/insights/category/${cat["Old Hobby"]}`)).json.data;
    assert.deepEqual([old.total, old.txnCount, "parentName" in old], [10_000, 1, false]);
    const quiet = (await me.send("GET", `/insights/category/${cat.Healthcare}?period=week`)).json.data;
    assert.deepEqual([quiet.total, quiet.previousTotal, quiet.shareOfSpend, quiet.shareOfEverydaySpend, quiet.txnCount, quiet.children], [0, 0, 0, 0, 0, []]);
});

test("insights: uncategorised everyday spend is in the shares' total and has its own share; trips are not", async () => {
    setClock(NOW);
    const u = await api.user("insights-uncat");
    const ids: Record<string, string> = {};
    for (const c of (await u.send("GET", "/categories")).json.data as { _id: string; name: string }[]) ids[c.name] = c._id;
    const b = await u.account("Bank", { startingBalance: 1_000_000 });
    const ravi = await u.account("Ravi", { type: "person", startingBalance: 0 });
    await txn(u, "expense", 13_000, b, "2026-04-02T06:30:00Z", { category: ids.Shopping });
    await txn(u, "expense", 10_000, b, "2026-04-03T06:30:00Z", { category: ids.Groceries });
    await txn(u, "expense", 5_000, b, "2026-04-04T06:30:00Z", { category: ids.Healthcare });
    // A bill paid with no category: an everyday expense in no slice.
    const bill = await u.send("POST", "/bills", { name: "Water", amount: 2_000, dueDate: "2026-04-05T06:30:00Z", recurring: false, account: b });
    assert.equal((await u.send("POST", `/bills/${bill.json.data._id}/pay`, { account: b })).status, 200);
    // Your 7,000 share of a 14,000 trip dinner.
    await tripWithExpense(u, [ravi], b, 14_000, "2026-04-06T06:30:00Z");

    const d = (await u.send("GET", "/insights")).json.data;
    // Everyday spending 30,000 = 13,000 + 10,000 + 5,000 + 2,000; with trips 37,000.
    assert.deepEqual(d.incomeVsExpense.at(-1), { periodStart: "2026-04-01", income: 0, expense: 37_000, tripExpense: 7_000 });
    assert.deepEqual(d.byCategory.map((c: { name: string; total: number; share?: number }) => [c.name, c.total, c.share]), [
        ["Shopping", 13_000, 43.3], ["Food & Dining", 10_000, 33.3], ["Trips", 7_000, undefined], ["Healthcare", 5_000, 16.7],
    ]);
    assert.deepEqual(d.uncategorised, { total: 2_000, share: 6.7 });
    const shares = d.byCategory.reduce((s: number, c: { share?: number }) => s + (c.share ?? 0), 0) + d.uncategorised.share;
    assert.equal(Math.round(shares * 10), 1000, "the shares and uncategorised add up to 100.0");

    const shop = (await u.send("GET", `/insights/category/${ids.Shopping}`)).json.data;
    assert.equal(shop.shareOfEverydaySpend, (13_000 / 30_000) * 100);
    assert.equal(shop.shareOfSpend, (13_000 / 37_000) * 100);
});

test("insights: bad query 400, bad or foreign ids 404, signed out 401", async () => {
    setClock(NOW);
    failed(await me.send("GET", "/insights?period=quarter"), 400, "invalid_input");
    failed(await me.send("GET", "/insights?offset=1"), 400, "invalid_input", "You can't look at a future period");
    failed(await me.send("GET", "/insights?offset=half"), 400, "invalid_input");
    failed(await me.send("GET", "/insights?offset=-1.5"), 400, "invalid_input");
    failed(await me.send("GET", `/insights/category/${cat.Groceries}?offset=2`), 400, "invalid_input");
    for (const id of ["abc", "trips", MISSING]) {
        failed(await me.send("GET", `/insights/category/${id}`), 404, "not_found", "That category doesn't exist any more");
    }
    const other = await api.user("insights-other");
    failed(await other.send("GET", `/insights/category/${cat.Groceries}`), 404, "not_found", "That category doesn't exist any more");
    const theirs = (await other.send("GET", "/insights")).json.data;
    assert.deepEqual([theirs.byCategory, theirs.byAccount, theirs.txnCount], [[], [], 0]);
    failed(await api.send("GET", "/insights"), 401, "unauthenticated");
    failed(await api.send("GET", `/insights/category/${cat.Groceries}`), 401, "unauthenticated");
});
