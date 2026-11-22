import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { useTestApi, type TestUser } from "../harness";
import { failed, resetClock, setClock, txn } from "./readHelpers";
import { oneDecimalShares } from "../../src/services/shareMath";
import { defaultCloseDay } from "../../src/services/tripService";

// The 2.8.6 trips rule behind `trips=entries`: a closed trip is one expense in Trips on its close
// day, an open trip counts nowhere, and none of a trip's own rows count. Without the parameter
// every read keeps its 2.8.5 meaning. Clock: Wednesday 15 April 2026, noon in Kolkata.

const api = useTestApi();
afterEach(resetClock);
after(resetClock);

const NOW = "2026-04-15T06:30:00Z";
let me: TestUser;
const cat: Record<string, string> = {};
let bank: string;
let friend: string;
let goa: string;
let ooty: string;

const tripWith = async (name: string, day: string, title: string, cost: number, category: string) => {
    const t = await me.send("POST", "/trips", { name, startDate: day, endDate: day, members: [friend], budget: null });
    assert.equal(t.status, 201, t.text);
    const half = cost / 2;
    const e = await me.send("POST", `/trips/${t.json.data._id}/expenses`, { title, occurredAt: `${day}T06:30:00Z`, category, cost, paidBy: null, paidFrom: bank, shares: [{ account: null, amount: half }, { account: friend, amount: half }] });
    assert.equal(e.status, 201, e.text);
    return t.json.data._id as string;
};

before(async () => {
    await api.ready();
    setClock(NOW);
    me = await api.user("trip-entries");
    for (const c of (await me.send("GET", "/categories")).json.data as { _id: string; name: string }[]) cat[c.name] = c._id;
    bank = await me.account("Bank", { startingBalance: 10_000_000 });
    friend = await me.account("Ravi", { type: "person", startingBalance: 0 });
    await txn(me, "income", 200_000, bank, "2026-03-01T06:30:00Z");
    await txn(me, "income", 1_000_000, bank, "2026-04-01T06:30:00Z");
    await txn(me, "expense", 300_000, bank, "2026-04-02T06:30:00Z", { category: cat["Groceries"], title: "Big shop" });
    await txn(me, "expense", 100_000, bank, "2026-04-03T06:30:00Z", { category: cat["Shopping"], title: "Shoes" });
    await txn(me, "expense", 33_333, bank, "2026-04-04T06:30:00Z", { category: cat["Food & Dining"], title: "Lunch" });
    // Spent in March, closed into April; your share 66,667.
    goa = await tripWith("Goa", "2026-03-20", "Dinner", 133_334, cat["Food & Dining"]);
    assert.equal((await me.send("POST", `/trips/${goa}/close`, { letGo: [], closedOn: "2026-04-05" })).status, 200);
    // Still open: its 50,000 share counts nowhere.
    ooty = await tripWith("Ooty", "2026-04-10", "Boat", 100_000, cat["Transportation"]);
    resetClock();
});

const APRIL = "startDate=2026-04-01&endDate=2026-04-30";

test("insights: Trips is one ranked category on the close day; shares over all spending add to 100.0", async () => {
    setClock(NOW);
    const r = await me.send("GET", "/insights?period=month&offset=0&trips=entries");
    assert.equal(r.status, 200, r.text);
    const d = r.json.data;
    const trips = d.byCategory.find((s: { categoryId: string }) => s.categoryId === "trips");
    assert.deepEqual(trips, { categoryId: "trips", name: "Trips", total: 66_667, share: 13.3, children: [{ categoryId: goa, name: "Goa", total: 66_667, emoji: "🧳", closedOn: "2026-04-05" }] });
    assert.deepEqual(d.byCategory.map((s: { name: string }) => s.name), ["Food & Dining", "Shopping", "Trips"]);
    const total = d.byCategory.reduce((s: number, c: { share: number }) => s + c.share, 0) + d.uncategorised.share;
    assert.equal(Math.round(total * 10) / 10, 100);
    // Food (Groceries rolled up) holds only everyday rows, not the trip's dinner.
    assert.equal(d.byCategory.find((s: { name: string }) => s.name === "Food & Dining").total, 333_333);
    assert.deepEqual(d.incomeVsExpense[5], { periodStart: "2026-04-01", income: 1_000_000, expense: 500_000, tripExpense: 66_667 });
    // 1 income + 3 everyday expenses + Goa; Ooty is open.
    assert.equal(d.entryCount, 5);
    assert.equal(d.trend.find((p: { date: string }) => p.date === "2026-04-05").tripAmount, 66_667);
    assert.equal(d.trend.find((p: { date: string }) => p.date === "2026-04-10").amount, 0);
    assert.ok(d.byAccount.some((a: { accountId: string; total: number }) => a.accountId === "trips" && a.total === 66_667));
    // March: Goa's spending days count nothing under the rule.
    const march = (await me.send("GET", "/insights?period=month&offset=-1&trips=entries")).json.data;
    assert.equal(march.incomeVsExpense[5].expense, 0);
});

test("insights without trips=entries keep the 2.8.5 meaning", async () => {
    setClock(NOW);
    const d = (await me.send("GET", "/insights?period=month&offset=0")).json.data;
    // Ooty's open share counts by the day spent, Goa's in March; no entryCount.
    assert.deepEqual(d.incomeVsExpense[5], { periodStart: "2026-04-01", income: 1_000_000, expense: 483_333, tripExpense: 50_000 });
    assert.equal(d.incomeVsExpense[4].tripExpense, 66_667);
    assert.equal("entryCount" in d, false);
    const trips = d.byCategory.find((s: { categoryId: string }) => s.categoryId === "trips");
    assert.equal(trips.share, undefined);
    assert.equal(trips.children[0].closedOn, undefined);
});

test("category insights: the category's own figures leave trips out; its share is over all spending", async () => {
    setClock(NOW);
    const d = (await me.send("GET", `/insights/category/${cat["Food & Dining"]}?period=month&offset=0&trips=entries`)).json.data;
    assert.equal(d.total, 333_333);
    assert.equal(Math.round(d.shareOfSpend * 10) / 10, 66.7);
});

test("transactions: one row per closed trip on its close day, paged on the server", async () => {
    setClock(NOW);
    const seen: { _id: string; kind?: string }[] = [];
    for (let page = 1; page <= 3; page += 1) {
        const r = await me.send("GET", `/transactions?page=${page}&limit=2&trips=entries&${APRIL}`);
        assert.equal(r.status, 200, r.text);
        assert.equal(r.json.data.total, 5);
        assert.equal(r.json.data.hasNextPage, page < 3);
        seen.push(...r.json.data.items);
    }
    assert.equal(new Set(seen.map((s) => s._id)).size, 5);
    const trip = seen.find((s) => s.kind === "trip") as Record<string, unknown>;
    assert.equal(trip._id, `trip-${goa}`);
    assert.equal(trip.amount, 66_667);
    assert.equal(trip.closedOn, "2026-04-05");
    assert.equal(trip.category, "trips");
    assert.equal(trip.account, null);
    // Newest first: Goa (5 Apr) before Lunch (4 Apr).
    const titles = seen.map((s) => (s as { title?: string }).title);
    assert.ok(titles.indexOf("Goa") < titles.indexOf("Lunch"));
    assert.equal(titles.includes("Boat"), false);
});

test("transactions: search matches a trip's own expense, filters treat Trips as a category", async () => {
    setClock(NOW);
    const found = (await me.send("GET", "/transactions?trips=entries&search=dinner")).json.data.items;
    assert.deepEqual(found.map((r: { title: string; insideMatches?: number }) => [r.title, r.insideMatches]), [["Goa", 1]]);
    const onlyTrips = (await me.send("GET", "/transactions?trips=entries&category=trips")).json.data.items;
    assert.deepEqual(onlyTrips.map((r: { title: string }) => r.title), ["Goa"]);
    const byAccount = (await me.send("GET", `/transactions?trips=entries&account=${bank}`)).json.data.items;
    assert.equal(byAccount.some((r: { kind?: string }) => r.kind === "trip"), false);
    const income = (await me.send("GET", "/transactions?trips=entries&type=income")).json.data.items;
    assert.equal(income.some((r: { kind?: string }) => r.kind === "trip"), false);
    const s = (await me.send("GET", `/transactions/summary?trips=entries&${APRIL}`)).json.data;
    assert.deepEqual(s, { income: 1_000_000, expenses: 500_000, savings: 500_000, tripExpenses: 66_667 });
});

test("transactions: the 2.8.5 requests are unchanged (trips=exclude has no trip rows)", async () => {
    setClock(NOW);
    const items = (await me.send("GET", `/transactions?trips=exclude&${APRIL}`)).json.data.items;
    assert.equal(items.some((r: { kind?: string; tripId?: string | null }) => r.kind || r.tripId), false);
    const s = (await me.send("GET", `/transactions/summary?trips=exclude&${APRIL}`)).json.data;
    assert.deepEqual(s, { income: 1_000_000, expenses: 433_333, savings: 516_667, tripExpenses: 50_000 });
});

test("dashboard summary: Month, Year and All time under the rule; no period keeps the 2.8.5 body", async () => {
    setClock(NOW);
    const month = (await me.send("GET", "/dashboard/summary?period=month&trips=entries")).json.data;
    assert.equal(month.period, "month");
    assert.deepEqual([month.income, month.expenses, month.tripExpenses, month.savings], [1_000_000, 500_000, 66_667, 500_000]);
    assert.deepEqual(month.previous, { income: 200_000, expenses: 0, tripExpenses: 0, savings: 200_000 });
    assert.equal(month.firstRecordAt, "2026-03-01T06:30:00.000Z");
    const year = (await me.send("GET", "/dashboard/summary?period=year&trips=entries")).json.data;
    assert.deepEqual([year.income, year.expenses, year.previous], [1_200_000, 500_000, null]);
    assert.equal(year.netWorthAtStart, null);
    const all = (await me.send("GET", "/dashboard/summary?period=all&trips=entries")).json.data;
    assert.deepEqual([all.income, all.expenses, all.previous, all.periodStart], [1_200_000, 500_000, null, "2026-02-28T18:30:00.000Z"]);
    // This month's flow line still closes the series whatever the period.
    assert.equal(all.flowTrend.at(-1).expense, 500_000);
    const plain = (await me.send("GET", "/dashboard/summary")).json.data;
    assert.equal("period" in plain, false);
    assert.equal(plain.expenses, 483_333);
});

test("review and Home's daily series count Goa once, on its close day", async () => {
    setClock(NOW);
    // The week of 30 March to 5 April holds Goa's close day.
    const week = (await me.send("GET", "/reviews?period=week&offset=-2&trips=entries")).json.data;
    assert.deepEqual([week.expenses, week.tripExpenses, week.saved], [500_000, 66_667, 500_000]);
    assert.deepEqual(week.categories.map((c: { name: string; share: number }) => [c.name, c.share]), [["Food & Dining", 66.7], ["Shopping", 20], ["Trips", 13.3]]);
    assert.equal(week.biggestExpense.title, "Big shop");
    const plainWeek = (await me.send("GET", "/reviews?period=week&offset=-2")).json.data;
    assert.deepEqual([plainWeek.expenses, plainWeek.tripExpenses], [433_333, 0]);
    const home = (await me.send("GET", "/dashboard/insights?trips=entries")).json.data;
    assert.equal(home.pace.current.find((p: { date: string }) => p.date === "2026-04-05").amount, 66_667);
    assert.equal(home.pace.current.find((p: { date: string }) => p.date === "2026-04-10").amount, 0);
});

test("health: savings count Goa once and Ooty nowhere; the buffer stays on everyday spending", async () => {
    setClock(NOW);
    const savingsOf = (h: { pillars: { key: string; value: string }[] }) => h.pillars.find((p) => p.key === "savings")?.value;
    const rule = (await me.send("GET", "/dashboard/health?trips=entries")).json.data;
    const plain = (await me.send("GET", "/dashboard/health")).json.data;
    // Income ₹12,000.00 in the 90 days. Rule: spent 4,33,333 + Goa 66,667 paise. 2.8.5: plus Ooty's open 50,000.
    assert.equal(savingsOf(rule), "58.3%");
    assert.equal(savingsOf(plain), "54.2%");
    assert.equal(rule.runwayMonths, plain.runwayMonths);
});

test("close date: range checked, changed without reopening, cleared by reopening", async () => {
    setClock(NOW);
    failed(await me.send("PATCH", `/trips/${ooty}/close-date`, { closedOn: "2026-04-12" }), 409, "conflict");
    failed(await me.send("POST", `/trips/${ooty}/close`, { letGo: [], closedOn: "2026-04-09" }), 400, "invalid_input", "Pick a day from the trip's start");
    failed(await me.send("POST", `/trips/${ooty}/close`, { letGo: [], closedOn: "2026-04-16" }), 400, "invalid_input", "Pick a day up to today");
    failed(await me.send("PATCH", `/trips/${goa}/close-date`, { closedOn: "2026-04-16" }), 400, "invalid_input");
    failed(await me.send("PATCH", `/trips/${goa}/close-date`, { closedOn: "21-04-2026" }), 400, "invalid_input");

    assert.equal((await me.send("PATCH", `/trips/${goa}/close-date`, { closedOn: "2026-03-22" })).status, 200);
    assert.equal((await me.send("GET", `/trips/${goa}`)).json.data.trip.closedOn, "2026-03-22");
    const april = (await me.send("GET", "/insights?period=month&offset=0&trips=entries")).json.data;
    assert.equal(april.byCategory.some((s: { categoryId: string }) => s.categoryId === "trips"), false);
    const march = (await me.send("GET", "/insights?period=month&offset=-1&trips=entries")).json.data;
    assert.equal(march.incomeVsExpense[5].expense, 66_667);

    // Closing with no day takes the last expense day (Ooty's boat ride, 10 April).
    assert.equal((await me.send("POST", `/trips/${ooty}/close`, { letGo: [] })).status, 200);
    assert.equal((await me.send("GET", `/trips/${ooty}`)).json.data.trip.closedOn, "2026-04-10");
    assert.equal((await me.send("POST", `/trips/${ooty}/reopen`, {})).status, 200);
    const reopened = (await me.send("GET", "/trips")).json.data.trips.find((t: { _id: string }) => t._id === ooty);
    assert.equal(reopened.closedOn, null);

    assert.equal((await me.send("PATCH", `/trips/${goa}/close-date`, { closedOn: "2026-04-05" })).status, 200);
});

test("default close day stays inside the trip's start and today", () => {
    const range = { first: "2026-10-01", today: "2026-11-22" };
    assert.equal(defaultCloseDay("2026-10-21", range), "2026-10-21");
    assert.equal(defaultCloseDay("2026-09-30", range), "2026-10-01");
    assert.equal(defaultCloseDay("2026-11-23", range), "2026-11-22");
    assert.equal(defaultCloseDay(null, range), "2026-11-22");
});

test("Trips is a reserved category name", async () => {
    setClock(NOW);
    failed(await me.send("POST", "/categories", { name: " trips ", kind: "expense" }), 400, "invalid_input", "Trips is a built-in category");
    failed(await me.send("PATCH", `/categories/${cat["Shopping"]}`, { name: "TRIPS" }), 400, "invalid_input");
});

test("shares rounded together add to 100.0 (October with Udupi in Trips)", () => {
    // Bills, Shopping, Transportation, Trips, Food & Dining, Gifts; paise.
    const parts = [33_25_000, 17_35_043, 14_88_605, 11_07_176, 10_42_209, 8_05_237];
    const shares = oneDecimalShares(parts, parts.reduce((a, b) => a + b, 0));
    assert.deepEqual(shares, [35.0, 18.2, 15.7, 11.6, 11.0, 8.5]);
    assert.equal(Math.round(shares.reduce((a, b) => a + b, 0) * 10) / 10, 100);
});
