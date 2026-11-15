import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { useTestApi, type TestUser } from "../harness";
import { failed, resetClock, setClock, txn, tripWithExpense } from "./readHelpers";
import { buildSnapshot, computeCurrentStreak } from "../../src/services/highlightSnapshotService";
import { rankHighlightRules } from "../../src/services/highlightRules";
import { healthScore } from "../../src/services/healthService";

// GET /highlights (the cold-start gate, then the snapshot the rules run over) and
// GET /highlights/history, with the clock frozen at Wednesday 15 April 2026, noon in Kolkata.

const api = useTestApi();
afterEach(resetClock);
after(resetClock);

const NOW = "2026-04-15T06:30:00Z";
const ZONE = "Asia/Kolkata";
const WARMING_UP = "A few more weeks of transactions and this screen gets useful — there isn't enough history yet to compare against.";

const logsOf = (u: TestUser) => api.ro.col("highlightlogs").find<{ key: string; ruleId: string }>({ userId: new ObjectId(u.id) });

let me: TestUser;
const cat: Record<string, string> = {};
let bank: string;
let fund: string;
let friend: string;

before(async () => {
    await api.ready();
    setClock(NOW);
    me = await api.user("highlights");
    for (const c of (await me.send("GET", "/categories")).json.data as { _id: string; name: string }[]) cat[c.name] = c._id;
    bank = await me.account("Bank", { startingBalance: 2_000_000 });
    fund = await me.account("Index fund", { type: "investment", startingBalance: 1_000_000 });
    friend = await me.account("Ravi", { type: "person", startingBalance: 0 });
    const oldCard = await me.account("Old card", { type: "credit_card", startingBalance: 0 });
    assert.equal((await me.send("DELETE", `/accounts/${oldCard}`)).status, 200);
    const spend = (amount: number, category: string, at: string, title = category) => txn(me, "expense", amount, bank, at, { category: cat[category], title });

    for (const m of ["01", "02", "03"]) {
        await txn(me, "income", 1_000_000, bank, `2026-${m}-05T06:30:00Z`, { title: "Salary" });
        await spend(100_000, "Groceries", `2026-${m}-10T06:30:00Z`);
        await spend(64_900, "Movies & Events", `2026-${m}-20T06:30:00Z`, "Netflix");
    }
    for (const m of ["02", "03", "04"]) await txn(me, "transfer", 100_000, bank, `2026-${m}-06T06:30:00Z`, { toAccount: fund });
    await txn(me, "positiveAdjustment", 50_000, fund, "2026-03-25T06:30:00Z");
    await txn(me, "income", 1_000_000, bank, "2026-04-05T06:30:00Z", { title: "Salary" });
    await spend(300_000, "Groceries", "2026-04-02T06:30:00Z");
    await spend(20_000, "Shopping", "2026-04-03T06:30:00Z");
    for (const d of ["12", "13", "14"]) await spend(1_000, "Cafes & Snacks", `2026-04-${d}T06:30:00Z`, "Tea");
    await tripWithExpense(me, [friend], bank, 80_000, "2026-04-08T06:30:00Z");

    assert.equal((await me.send("POST", "/budgets", { category: cat.Groceries, month: "2026-04", limit: 350_000 })).status, 201);
    assert.equal((await me.send("POST", "/budgets", { category: cat.Shopping, month: "2026-03", limit: 10_000 })).status, 201);
    assert.equal((await me.send("POST", "/bills", { name: "Electricity", amount: 50_000, dueDate: "2026-04-18T06:30:00Z", recurring: false, account: bank })).status, 201);
    assert.equal((await me.send("POST", "/bills", { name: "Gym", amount: 200_000, dueDate: "2026-04-20T06:30:00Z", recurring: true, frequency: "monthly" })).status, 201);
    const goal = await me.send("POST", "/goals", { name: "Holiday", target: 500_000, deadline: "2026-10-15T06:30:00Z" });
    assert.equal((await me.send("POST", `/goals/${goal.json.data._id}/contribute`, { amount: 100_000 })).status, 200);
    resetClock();
});

test("snapshot: one user's month as the rules see it, cut in their zone", async () => {
    const now = new Date(NOW);
    const streak = await computeCurrentStreak(me.id, ZONE, now);
    assert.equal(streak, 3, "12, 13 and 14 April");
    const snap = await buildSnapshot(me.id, ZONE, "INR", now, new Date("2026-01-05T06:30:00Z"), streak);
    const health = await healthScore(me.id, ZONE, now);

    assert.deepEqual([snap.currency, snap.monthLabel, snap.daysElapsed, snap.daysInMonth, snap.currentStreak], ["INR", "2026-04", 15, 30, 3]);
    // Sign-up's Cash account and the person account are in; the archived card is not.
    const cash = snap.accounts[0];
    assert.deepEqual(snap.accounts, [
        { accountId: cash.accountId, name: "Cash", type: "cash", balance: 0 },
        { accountId: bank, name: "Bank", type: "bank", balance: 4_802_300 },
        { accountId: fund, name: "Index fund", type: "investment", balance: 1_350_000 },
        { accountId: friend, name: "Ravi", type: "person", balance: 40_000 },
    ]);
    assert.deepEqual(snap.budgets, [{ categoryId: cat.Groceries, categoryName: "Groceries", limit: 350_000, spent: 300_000 }]);
    assert.deepEqual(snap.prevBudgets, [{ categoryId: cat.Shopping, categoryName: "Shopping", limit: 10_000, spent: 0 }]);
    assert.deepEqual(snap.bills, [
        { name: "Electricity", amount: 50_000, daysUntilDue: 3, accountId: bank },
        { name: "Gym", amount: 200_000, daysUntilDue: 5, accountId: null },
    ]);
    assert.deepEqual(snap.goals, [{ name: "Holiday", target: 500_000, saved: 100_000, monthsSinceCreated: 0, monthsUntilDeadline: 6 }]);
    assert.deepEqual(snap.healthFocus, health.focus ? { label: health.focus.label, hint: health.focus.hint } : null);
    // Totals keep the 40,000 trip share; the per-category spend leaves it out.
    const { byCategory, ...flows } = snap.thisMonth;
    assert.deepEqual(flows, { income: 1_000_000, expense: 363_000 });
    assert.deepEqual([...byCategory].sort((a, b) => b.total - a.total),
        [{ categoryId: cat["Food & Dining"], name: "Food & Dining", total: 303_000 }, { categoryId: cat.Shopping, name: "Shopping", total: 20_000 }]);
    assert.deepEqual(snap.months, ["2026-01", "2026-02", "2026-03"].map((label) => ({ label, income: 1_000_000, expense: 164_900 })));
    // Unordered: the rules look averages up by category.
    assert.deepEqual([...snap.categoryAverages].sort((a, b) => b.total - a.total), [
        { categoryId: cat["Food & Dining"], name: "Food & Dining", total: 100_000 },
        { categoryId: cat.Entertainment, name: "Entertainment", total: 64_900 },
    ]);
    // Revalued 25 March; money went in every month from February.
    assert.deepEqual(snap.investments, { hasInvestments: true, totalValue: 1_350_000, daysSinceRevalued: 21, contributionStreakMonths: 3 });
    // Netflix, and the three 100,000 grocery runs (April's 300,000 is a stream of its own).
    assert.deepEqual({ ...snap.recurring, signature: typeof snap.recurring.signature }, { count: 2, signature: "string", topTitle: "Groceries", topAmount: 100_000, monthlyTotal: 164_900 });
});

test("highlights: past the gate, the ranked list (max 4) and every fired rule logged once", async () => {
    setClock(NOW);
    const r = await me.send("GET", "/highlights");
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.message, "Highlights fetched");
    const d = r.json.data;
    assert.deepEqual([d.generatedAt, d.timeZone, "warmingUp" in d], ["2026-04-15T06:30:00.000Z", ZONE, false]);
    const snap = await buildSnapshot(me.id, ZONE, "INR", new Date(NOW), new Date("2026-01-05T06:30:00Z"), 3);
    const ranked = rankHighlightRules(snap);
    assert.ok(ranked.length > 4, `expected more than 4 rules to fire, got ${ranked.map((h) => h.ruleId)}`);
    // Same top four as the rules give (ties on materiality may come in either order).
    const byKey = (hs: { key: string }[]) => [...hs].sort((a, b) => a.key.localeCompare(b.key));
    assert.deepEqual(byKey(d.highlights), byKey(JSON.parse(JSON.stringify(ranked.slice(0, 4)))));
    const m = d.highlights.map((h: { materiality: number }) => h.materiality);
    assert.deepEqual(m, [...m].sort((a: number, b: number) => b - a), "not ranked by materiality");
    for (const h of d.highlights) {
        assert.deepEqual(Object.keys(h).filter((k) => !["ruleId", "key", "severity", "title", "body", "materiality", "screen"].includes(k)), []);
    }
    const ids = ranked.map((h) => h.ruleId);
    for (const id of ["recurring_found", "category_spike", "budget_pace", "bill_cluster", "logging_streak", "investment_milestone", "investing_streak", "health_focus"]) assert.ok(ids.includes(id), `${id} didn't fire: ${ids}`);

    const logged = await logsOf(me);
    assert.deepEqual(logged.map((l) => l.key).sort(), ranked.map((h) => h.key).sort());
    // A second poll writes nothing new.
    await me.send("GET", "/highlights");
    assert.equal((await logsOf(me)).length, logged.length);
});

test("history: the page shape, newest first, every row once", async () => {
    setClock(NOW);
    const total = (await logsOf(me)).length;
    const all = (await me.send("GET", "/highlights/history")).json.data;
    assert.deepEqual([all.page, all.limit, all.total, all.hasNextPage, all.items.length], [1, 20, total, false, total]);
    for (const row of all.items) {
        for (const f of ["__v", "userId"]) assert.equal(f in row, false, `history row still sends ${f}`);
        for (const f of ["_id", "ruleId", "key", "severity", "title", "body", "materiality", "screen", "createdAt"]) assert.ok(f in row, `history row lost ${f}`);
    }
    const dates = all.items.map((i: { createdAt: string }) => i.createdAt);
    assert.deepEqual(dates, [...dates].sort().reverse());

    const first = (await me.send("GET", "/highlights/history?page=1&limit=2")).json.data;
    const second = (await me.send("GET", "/highlights/history?page=2&limit=2")).json.data;
    assert.deepEqual([first.items.length, first.hasNextPage, first.limit], [2, true, 2]);
    const seen = [...first.items, ...second.items].map((i: { _id: string }) => i._id);
    assert.equal(new Set(seen).size, seen.length, "a row on two pages");
    assert.deepEqual((await me.send("GET", "/highlights/history?page=99")).json.data.items, []);

    failed(await me.send("GET", "/highlights/history?limit=101"), 400, "invalid_input");
    failed(await me.send("GET", "/highlights/history?page=0"), 400, "invalid_input");
    failed(await me.send("GET", "/highlights/history?page=abc"), 400, "invalid_input");
    failed(await api.send("GET", "/highlights"), 401, "unauthenticated");
    failed(await api.send("GET", "/highlights/history"), 401, "unauthenticated");
    const other = await api.user("highlights-other");
    assert.deepEqual((await other.send("GET", "/highlights/history")).json.data, { items: [], page: 1, limit: 20, hasNextPage: false, total: 0 });
});

// ---- The cold-start gate ----------------------------------------------------------------------

test("gate: no transactions is warming up with nothing to show, and nothing logged", async () => {
    setClock(NOW);
    const u = await api.user("hl-empty");
    const d = (await u.send("GET", "/highlights")).json.data;
    assert.deepEqual(d, { highlights: [], generatedAt: "2026-04-15T06:30:00.000Z", timeZone: ZONE, warmingUp: WARMING_UP });
    assert.equal((await logsOf(u)).length, 0);
});

test("gate: under 14 days the streak still shows, and is logged", async () => {
    setClock(NOW);
    const u = await api.user("hl-young");
    const b = await u.account("Bank", { startingBalance: 1_000_000 });
    for (let i = 0; i < 12; i++) await txn(u, "expense", 1_000, b, `2026-04-${String(12 + (i % 3)).padStart(2, "0")}T06:30:00Z`);
    const d = (await u.send("GET", "/highlights")).json.data;
    assert.equal(d.warmingUp, WARMING_UP);
    assert.deepEqual(d.highlights, [{
        ruleId: "logging_streak", key: "logging_streak:3", severity: "win", title: "3 days in a row logging transactions",
        body: "Every day in this streak has at least one entry. Miss a day and it starts over.", materiality: 0, screen: "activity",
    }]);
    assert.deepEqual((await logsOf(u)).map((l) => l.key), ["logging_streak:3"]);
});

test("gate: 14 days of history but 9 expenses is still warming up; the 10th opens it", async () => {
    setClock(NOW);
    const u = await api.user("hl-count");
    const b = await u.account("Bank", { startingBalance: 1_000_000 });
    await txn(u, "income", 500_000, b, "2026-04-01T06:30:00Z");
    for (let i = 0; i < 9; i++) await txn(u, "expense", 1_000, b, "2026-04-02T06:30:00Z");
    const before = (await u.send("GET", "/highlights")).json.data;
    assert.deepEqual([before.warmingUp, before.highlights], [WARMING_UP, []], "no streak: nothing on 13 or 14 April");
    await txn(u, "expense", 1_000, b, "2026-04-03T06:30:00Z");
    const open = (await u.send("GET", "/highlights")).json.data;
    assert.equal("warmingUp" in open, false);
    assert.ok(Array.isArray(open.highlights) && open.highlights.length <= 4);

    // 13 days of history, ten expenses: warming up again.
    const v = await api.user("hl-days");
    const vb = await v.account("Bank", { startingBalance: 1_000_000 });
    for (let i = 0; i < 10; i++) await txn(v, "expense", 1_000, vb, "2026-04-02T06:30:00Z");
    assert.equal((await v.send("GET", "/highlights")).json.data.warmingUp, WARMING_UP);
});
