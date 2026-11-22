import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { useTestApi, type TestUser } from "../harness";
import { failed, resetClock, setClock, txn, tripWithExpense } from "./readHelpers";

// GET /reviews (reviewService and its timeline) for March 2026 and two weeks around it, with
// the clock frozen at Wednesday 15 April 2026, noon in Kolkata. Each figure is worked out from
// the rows below. Trips are in the 2.8.1 totals (`expenses`, `saved`), with `tripExpenses` saying
// how much; the review's biggest expense and, from 2.8.4, the timeline's are everyday only (D21).
// Sentences use exact paise and one-decimal percentages (Q3).

const api = useTestApi();
afterEach(resetClock);
after(resetClock);

const NOW = "2026-04-15T06:30:00Z";
let me: TestUser;
const cat: Record<string, string> = {};

before(async () => {
    await api.ready();
    // Signed up on the real clock: its token outlives every frozen date below.
    me = await api.user("reviews");
    setClock("2026-02-01T06:30:00Z");
    for (const c of (await me.send("GET", "/categories")).json.data as { _id: string; name: string }[]) cat[c.name] = c._id;
    const bank = await me.account("Bank", { startingBalance: 3_000_000 });
    const fund = await me.account("Index fund", { type: "investment", startingBalance: 500_000 });
    const gold = await me.account("Gold", { type: "investment", startingBalance: 200_000 });
    const friend = await me.account("Ravi", { type: "person", startingBalance: 0 });
    const spend = (amount: number, category: string, at: string) => txn(me, "expense", amount, bank, at, { category: cat[category], title: category });
    const bill = async (name: string, amount: number, dueDate: string, recurring: boolean) => {
        const r = await me.send("POST", "/bills", { name, amount, dueDate, recurring, ...(recurring ? { frequency: "monthly" } : {}), account: bank });
        assert.equal(r.status, 201, r.text);
        return r.json.data._id as string;
    };
    const water = await bill("Water", 5_000, "2026-03-05T06:30:00Z", false);
    const gym = await bill("Gym", 20_000, "2026-03-10T06:30:00Z", true);
    const phone = await bill("Phone", 7_000, "2026-03-20T06:30:00Z", false);

    await txn(me, "income", 1_000_000, bank, "2026-02-01T06:30:00Z");
    await spend(400_000, "Groceries", "2026-02-10T06:30:00Z");

    await txn(me, "income", 1_200_000, bank, "2026-03-01T06:30:00Z");
    await spend(100_000, "Groceries", "2026-03-03T06:30:00Z");
    await spend(50_000, "Shopping", "2026-03-09T06:30:00Z");
    for (const d of ["13", "14", "15"]) await spend(500, "Cafes & Snacks", `2026-03-${d}T06:30:00Z`);
    await txn(me, "transfer", 100_000, bank, "2026-03-15T06:30:00Z", { toAccount: fund });
    await tripWithExpense(me, [friend], bank, 300_000, "2026-03-20T06:30:00Z");
    await txn(me, "positiveAdjustment", 30_000, fund, "2026-03-25T06:30:00Z");
    await txn(me, "negativeAdjustment", 5_000, gold, "2026-03-26T06:30:00Z");
    await spend(1_000, "Restaurants", "2026-03-31T18:29:59Z");
    await spend(2_000, "Restaurants", "2026-03-31T18:30:00Z");

    // The only highlight March logs: the warm-up streak, seen on the 16th.
    setClock("2026-03-16T06:30:00Z");
    assert.equal((await me.send("GET", "/highlights")).json.data.highlights[0]?.ruleId, "logging_streak");
    setClock("2026-03-08T06:30:00Z");
    assert.equal((await me.send("POST", `/bills/${water}/pay`, { account: bank })).status, 200);
    setClock("2026-03-10T06:30:00Z");
    assert.equal((await me.send("POST", `/bills/${gym}/pay`, { account: bank })).status, 200);
    setClock("2026-03-12T06:30:00Z");
    for (const [name, target, amount] of [["Holiday", 1_000_000, 50_000], ["Bike", 500_000, 20_000]] as const) {
        const g = await me.send("POST", "/goals", { name, target });
        assert.equal((await me.send("POST", `/goals/${g.json.data._id}/contribute`, { amount })).status, 200);
    }
    setClock("2026-03-18T06:30:00Z");
    assert.equal((await me.send("POST", `/bills/${phone}/pay`, { account: bank })).status, 200);
    resetClock();
});

test("month: March's figures, habits, net worth, goals, bills and investments", async () => {
    setClock(NOW);
    const r = await me.send("GET", "/reviews");
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.message, "Review fetched");
    const { timeline, ...d } = r.json.data;
    assert.deepEqual(d, {
        period: "month", offset: -1, periodLabel: "March 2026",
        periodStart: "2026-02-28T18:30:00.000Z", periodEnd: "2026-03-31T18:30:00.000Z",
        // 1,200,000 in; out: groceries, shopping, tea, the trip share, the 23:59:59 dinner and the three bills.
        // (865,500 − 600,000) / 600,000 = 44.25%.
        verdict: { headline: "₹8,655.00 saved this period", detail: "Up 44.3% from last time." },
        income: 1_200_000, expenses: 334_500, tripExpenses: 150_000, saved: 865_500,
        previousIncome: 1_000_000, previousExpenses: 400_000, previousTripExpenses: 0, previousSaved: 600_000,
        // The bills have no category, so they are in no slice. `pct` (2.8.1) divides by the slices'
        // sum, 302,500; `share` by everyday spending, 184,500, which counts the bills' 32,000.
        categories: [
            { categoryId: "trips", name: "Trips", total: 150_000, pct: 50 },
            { categoryId: cat["Food & Dining"], name: "Food & Dining", total: 102_500, pct: 34, share: 55.6 },
            { categoryId: cat.Shopping, name: "Shopping", total: 50_000, pct: 17, share: 27.1 },
        ],
        uncategorised: { total: 32_000, share: 17.3 },
        other: null,
        biggestExpense: { title: "Groceries", amount: 100_000, occurredAt: "2026-03-03T06:30:00.000Z" },
        // Days with a row: 1, 3, 8, 9, 10, 13, 14, 15, 18, 20, 31. The 25th and 26th are adjustments only.
        habits: { streakAtEnd: 1, activeDays: 11, totalDays: 31, noSpendDays: 20 },
        // 4,300,000 on 1 March; +890,500 over March (adjustments included).
        netWorth: { total: 5_190_500, previousTotal: 4_300_000 },
        goals: [{ goalId: d.goals[0].goalId, name: "Holiday", contributed: 50_000 }, { goalId: d.goals[1].goalId, name: "Bike", contributed: 20_000 }],
        bills: { paidCount: 3, dueCount: 2, late: [{ name: "Water", daysLate: 3 }] },
        investments: { contributed: 100_000, portfolioChange: 25_000, biggestGainer: { name: "Index fund", amount: 30_000 } },
    });
});

test("month: the timeline is dated and sorted; its biggest expense is the everyday one", async () => {
    setClock(NOW);
    const { timeline } = (await me.send("GET", "/reviews?period=month&offset=-1")).json.data;
    assert.deepEqual(timeline, [
        // Everyday weeks from the 1st: 100,000, 76,000, 7,500 (the trip's 150,000 left out), then
        // nothing: the first is heaviest at 100,000 against a 45,875 average. With the trip, as
        // up to 2.8.3, the standout was the empty fourth week ("lightest … ₹0 spent").
        { date: "2026-03-01T00:00:00.000Z", kind: "warn", text: "Your heaviest week this period — ₹1,000.00 spent" },
        // The groceries, as `biggestExpense` says; 2.8.1 named the bigger trip share (1,500) here.
        { date: "2026-03-03T06:30:00.000Z", kind: "neutral", text: "Biggest expense of the period: Groceries, ₹1,000.00" },
        { date: "2026-03-08T06:30:00.000Z", kind: "warn", text: "Water was paid 3 days late" },
        { date: "2026-03-12T06:30:00.000Z", kind: "win", text: "₹500.00 added to Holiday" },
        { date: "2026-03-16T06:30:00.000Z", kind: "win", text: "3 days in a row logging transactions" },
        { date: "2026-03-31T18:30:00.000Z", kind: "win", text: "Period closes: ₹8,655.00 saved" },
    ]);
});

test("week: last week and the week across the month end; no net worth for a week", async () => {
    setClock(NOW);
    const last = (await me.send("GET", "/reviews?period=week")).json.data;
    // en-IN puts the day first (docs/api-reference.md shows "Aug 18 – 24").
    assert.deepEqual([last.periodLabel, last.periodStart, last.periodEnd], ["6 Apr – 12", "2026-04-05T18:30:00.000Z", "2026-04-12T18:30:00.000Z"]);
    assert.deepEqual([last.income, last.expenses, last.saved, last.previousExpenses, last.previousSaved], [0, 0, 0, 3_000, -3_000]);
    assert.deepEqual(last.verdict, { headline: "₹0.00 saved this period", detail: "Up 100.0% from last time." });
    assert.deepEqual([last.netWorth, last.biggestExpense, last.categories, last.goals], [null, null, [], []]);
    assert.deepEqual(last.habits, { streakAtEnd: 0, activeDays: 0, totalDays: 7, noSpendDays: 7 });
    assert.deepEqual(last.investments, { contributed: 0, portfolioChange: 0, biggestGainer: null });
    assert.deepEqual(last.timeline, [{ date: "2026-04-12T18:30:00.000Z", kind: "win", text: "Period closes: ₹0.00 saved" }]);
    assert.deepEqual([last.tripExpenses, last.uncategorised], [0, { total: 0, share: 0 }]);

    const across = (await me.send("GET", "/reviews?period=week&offset=-2")).json.data;
    assert.deepEqual([across.periodLabel, across.expenses, across.biggestExpense.amount], ["30 Mar – 5 Apr", 3_000, 2_000]);
    assert.deepEqual(across.habits, { streakAtEnd: 0, activeDays: 2, totalDays: 7, noSpendDays: 5 });
    // A week has no standout-week line, and nothing in it is bigger than the restaurant bill.
    assert.deepEqual(across.timeline.map((m: { text: string }) => m.text), [
        "Biggest expense of the period: Restaurants, ₹20.00",
        // The true minus, as the app prints it.
        "Period closes: −₹30.00 saved",
    ]);
    assert.equal(across.timeline[1].kind, "neutral");
});

test("month: a new user's review has nothing to compare and no history", async () => {
    setClock(NOW);
    const u = await api.user("reviews-new");
    const empty = (await u.send("GET", "/reviews")).json.data;
    assert.deepEqual(empty.verdict, { headline: "₹0.00 saved this period", detail: "No prior period with any saving to compare against yet." });
    assert.deepEqual([empty.netWorth, empty.investments, empty.biggestExpense, empty.goals], [null, null, null, []]);
    assert.deepEqual(empty.bills, { paidCount: 0, dueCount: 0, late: [] });
    assert.deepEqual(empty.timeline, [{ date: "2026-03-31T18:30:00.000Z", kind: "win", text: "Period closes: ₹0.00 saved" }]);
    // An account that starts after the month it is asked about: no net worth for it.
    const b = await u.account("Bank", { startingBalance: 100_000 });
    await txn(u, "expense", 1_000, b, "2026-04-02T06:30:00Z");
    assert.equal((await u.send("GET", "/reviews")).json.data.netWorth, null);
});

test("reviews: the running period, other periods and bad offsets are 400; signed out 401", async () => {
    setClock(NOW);
    failed(await me.send("GET", "/reviews?offset=0"), 400, "invalid_input", "That period hasn't finished yet");
    failed(await me.send("GET", "/reviews?period=week&offset=1"), 400, "invalid_input", "That period hasn't finished yet");
    failed(await me.send("GET", "/reviews?period=day"), 400, "invalid_input");
    failed(await me.send("GET", "/reviews?period=year"), 400, "invalid_input");
    failed(await me.send("GET", "/reviews?offset=last"), 400, "invalid_input");
    assert.equal((await me.send("GET", "/reviews?utm=x")).status, 200, "unknown parameters are dropped");
    failed(await api.send("GET", "/reviews"), 401, "unauthenticated");
    // Another user's review of the same month is their own: nothing.
    const other = await api.user("reviews-other");
    const theirs = (await other.send("GET", "/reviews")).json.data;
    assert.deepEqual([theirs.income, theirs.expenses, theirs.categories, theirs.goals, theirs.bills.paidCount], [0, 0, [], [], 0]);
});

test("past five categories the rest is one Other row, and the shares add up to 100.0 (gaps row 209)", async () => {
    const u = await api.user("reviews-other");
    const c: Record<string, string> = {};
    for (const x of (await u.send("GET", "/categories")).json.data as { _id: string; name: string; parent: string | null }[]) if (!x.parent) c[x.name] = x._id;
    const bank = await u.account("Bank", { startingBalance: 10_000_000 });
    const spend: [string, number][] = [["Bills & Utilities", 40_000], ["Food & Dining", 25_000], ["Shopping", 12_000], ["Transportation", 9_000], ["Entertainment", 6_000], ["Healthcare", 5_000], ["Others", 3_000]];
    for (const [name, amount] of spend) await txn(u, "expense", amount, bank, "2026-03-10T06:30:00Z", { category: c[name], title: name });
    await txn(u, "expense", 1_000, bank, "2026-03-11T06:30:00Z", { title: "No category" });
    setClock(NOW);
    const d = (await u.send("GET", "/reviews?period=month&offset=-1&trips=entries")).json.data;
    assert.equal(d.categories.length, 5);
    assert.deepEqual(d.other, { total: 8_000, share: 8, count: 2 });
    const sum = d.categories.reduce((s: number, x: { share: number }) => s + x.share, 0) + d.uncategorised.share + d.other.share;
    assert.equal(Math.round(sum * 10) / 10, 100);
});
