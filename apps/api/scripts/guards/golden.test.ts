import { test } from "node:test";
import assert from "node:assert/strict";
import { compareSnapshots } from "./golden";

const snap = (responses: Record<string, { status: number; body: unknown }>) => ({ meta: {}, responses });
const ok = (data: unknown, message = "Fetched") => ({ status: 200, body: { success: true, statusCode: 200, message, data } });

test("identical recordings have no differences", () => {
    const a = snap({ "GET /accounts": ok([{ _id: "1", balance: 5 }]) });
    assert.deepEqual(compareSnapshots(a, a), []);
});

test("agreed changes are allowed: internal fields removed, message wording", () => {
    const a = snap({ "GET /accounts": ok([{ _id: "1", balance: 5, userId: "u", __v: 0 }], "Accounts fetched successfully") });
    const b = snap({ "GET /accounts": ok([{ _id: "1", balance: 5 }], "Accounts fetched") });
    const diffs = compareSnapshots(a, b);
    assert.equal(diffs.length, 3);
    assert.ok(diffs.every((d) => d.allowed));
});

test("anything else is a difference: a value, a new field, a status, a missing request", () => {
    const a = snap({ "GET /accounts": ok([{ _id: "1", balance: 5 }]), "GET /goals": ok([]) });
    const b = snap({ "GET /accounts": { status: 500, body: { success: false, data: [{ _id: "1", balance: 6, extra: 1 }] } } });
    const bad = compareSnapshots(a, b).filter((d) => !d.allowed).map((d) => `${d.request} ${d.path}`);
    assert.ok(bad.includes("GET /accounts (status)"));
    assert.ok(bad.includes("GET /accounts data.0.balance"));
    assert.ok(bad.includes("GET /accounts data.0.extra"));
    assert.ok(bad.includes("GET /goals (request)"));
});

test("time-driven values and unordered lists don't count", () => {
    const a = snap({ "GET /investments": ok({ annualReturn: 0.0389384274 }), "GET /transactions/title-suggestions": ok([{ title: "A" }, { title: "B" }]), "GET /investments/report": ok({ asOf: "t1" }) });
    const b = snap({ "GET /investments": ok({ annualReturn: 0.0389384128 }), "GET /transactions/title-suggestions": ok([{ title: "B" }, { title: "A" }]), "GET /investments/report": ok({ asOf: "t2" }) });
    assert.deepEqual(compareSnapshots(a, b), []);
    const moved = snap({ "GET /investments": ok({ annualReturn: 0.05 }), "GET /transactions/title-suggestions": ok([{ title: "A" }, { title: "B" }]), "GET /investments/report": ok({ asOf: "t1" }) });
    assert.equal(compareSnapshots(a, moved).length, 1);
});

test("R2 page shape: an old page compares to a new one, items to docs and total to totalDocs; ties by _id", () => {
    const row = (id: string, at: string, amount = 1) => ({ _id: id, occurredAt: at, amount });
    const old = { docs: [row("b", "t2"), row("a", "t2"), row("c", "t1")], totalDocs: 3, limit: 20, page: 1, totalPages: 1, pagingCounter: 1, hasPrevPage: false, hasNextPage: false, prevPage: null, nextPage: null };
    const now = { items: [row("a", "t2"), row("b", "t2"), row("c", "t1")], page: 1, limit: 20, hasNextPage: false, total: 3 };
    const diffs = compareSnapshots(snap({ "GET /transactions?page=1&limit=20": ok(old) }), snap({ "GET /transactions?page=1&limit=20": ok(now) }));
    assert.ok(diffs.length > 0 && diffs.every((d) => d.allowed === "page shape (R2)"), JSON.stringify(diffs));
    const wrong = compareSnapshots(snap({ "GET /transactions?page=1&limit=20": ok(old) }), snap({ "GET /transactions?page=1&limit=20": ok({ ...now, total: 4, items: [row("a", "t2", 9), row("b", "t2"), row("c", "t1")] }) }));
    assert.deepEqual(wrong.filter((d) => !d.allowed).map((d) => d.path).sort(), ["data.items.0.amount", "data.total"]);
    const feed = compareSnapshots(snap({ "GET /notifications?page=1&limit=20": ok({ items: [], unread: 0, page: 1, hasNextPage: false }) }),
        snap({ "GET /notifications?page=1&limit=20": ok({ items: [], unread: 0, page: 1, limit: 20, hasNextPage: false, total: 0 }) }));
    assert.ok(feed.length === 2 && feed.every((d) => d.allowed));
});

test("S2: the backup's new goalContributionLogs is allowed, nothing else new is", () => {
    const diffs = compareSnapshots(snap({ "GET /backup": ok({ goals: [] }) }), snap({ "GET /backup": ok({ goals: [], goalContributionLogs: [], extra: 1 }) }));
    assert.deepEqual(diffs.map((d) => [d.path, !!d.allowed]), [["data.goalContributionLogs", true], ["data.extra", false]]);
});

test("2.8.4: the new trip and share fields, D24 history and Q3 sentences are allowed; other changes are not", () => {
    const before = snap({
        "GET /dashboard/summary": ok({ expenses: 5, netWorth: 9, netWorthTrend: [{ label: "Oct", total: 3 }] }),
        "GET /reviews?period=month&offset=-1": ok({ verdict: { headline: "₹8,655 saved this period" }, netWorth: { total: 1 }, categories: [{ pct: 50 }] }),
    });
    const after = snap({
        "GET /dashboard/summary": ok({ expenses: 6, tripExpenses: 1, netWorth: 9, netWorthTrend: [{ label: "Oct", total: 2 }] }),
        "GET /reviews?period=month&offset=-1": ok({ verdict: { headline: "₹8,655.00 saved this period" }, netWorth: { total: 0 }, categories: [{ pct: 50, share: 55.6 }], tripExpenses: 0 }),
    });
    assert.deepEqual(compareSnapshots(before, after).map((d) => [d.path, !!d.allowed]), [
        ["data.expenses", false],
        ["data.netWorthTrend.0.total", true],
        ["data.tripExpenses", true],
        ["data.verdict.headline", true],
        ["data.netWorth.total", true],
        ["data.categories.0.share", true],
        ["data.tripExpenses", true],
    ]);
});
