import test, { before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "crypto";
import { MESSAGES, styleProblems } from "../utils/messages";

// HTTP tests for bills, goals, budgets, notifications and recurring, against a LOCAL dev API
// (reminders off). They need a running server, so they are not in `npm test`:
//
//   cd apps/api && DISABLE_REMINDERS=true PORT=7231 node -r ts-node/register src/server.ts
//   API_BASE=http://127.0.0.1:7231 node -r ts-node/register --test src/controllers/billsGoals.live.test.ts
//
// Each run signs up a new throwaway @example.test user and touches nobody else.

const BASE = process.env.API_BASE;
const skip = BASE ? false : "set API_BASE to a local dev API to run these";
if (BASE && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE)) throw new Error(`Refusing ${BASE}: local API only`);

type Reply = { status: number; json: any };
let token = "";
const send = async (method: string, path: string, body?: unknown): Promise<Reply> => {
    const res = await fetch(`${BASE}/api/v1${path}`, {
        method,
        headers: { "Content-Type": "application/json", "X-App-Version": "2.6.0", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
};
const par = <T>(n: number, fn: () => Promise<T>) => Promise.all(Array.from({ length: n }, fn));
const sorted = (rs: Reply[]) => rs.map((r) => r.status).sort();
const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const MISSING = "65a1b2c3d4e5f60718293a4b";

/** An error the 2.6.0 app shows as-is: a status, a code, and a sentence that follows the rules. */
const failed = (r: Reply, status: number, code: string, message?: string) => {
    assert.equal(r.status, status, JSON.stringify(r.json));
    assert.equal(r.json.code, code);
    assert.equal(typeof r.json.message, "string");
    assert.deepEqual(styleProblems(r.json.message), [], r.json.message);
    if (message) assert.equal(r.json.message, message);
};

let cat = "";
let bank = "";
let fund = "";
const account = async (name: string, type = "bank", startingBalance = 10_000_000) => {
    const r = await send("POST", "/accounts", { name, type, startingBalance, ...(type === "investment" ? { investmentKind: "mutual_fund" } : {}) });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return r.json.data._id as string;
};
const balanceOf = async (id: string) => ((await send("GET", "/accounts")).json.data as { _id: string; balance: number }[]).find((a) => a._id === id)!.balance;
const billBody = (name: string, dueInDays: number, recurring: boolean, extra: Record<string, unknown> = {}) => ({
    name, amount: 200_000, dueDate: days(dueInDays), recurring, ...(recurring ? { frequency: "monthly" } : {}), reminderDays: 0, category: cat, toInvestment: null, ...extra,
});
const newBill = async (...args: Parameters<typeof billBody>) => {
    const r = await send("POST", "/bills", billBody(...args));
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return r.json.data as { _id: string; dueDate: string };
};
const billById = async (id: string) => ((await send("GET", "/bills")).json.data as { _id: string; dueDate: string; status: string }[]).find((b) => b._id === id);
const monthsBetween = (a: string, b: string) => {
    const x = new Date(a); const y = new Date(b);
    return (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + y.getUTCMonth() - x.getUTCMonth();
};

before(async () => {
    if (skip) return;
    const email = `w2-live-${Date.now().toString(36)}-${randomBytes(2).toString("hex")}@example.test`;
    const password = "w2-live-pass-1234";
    assert.equal((await send("POST", "/auth/register", { name: "W2 Live", email, password, timeZone: "Asia/Kolkata" })).status, 201);
    token = (await send("POST", "/auth/login", { email, password })).json.data.accessToken;
    const cats = (await send("GET", "/categories")).json.data as { _id: string; kind: string; parent?: string | null }[];
    cat = cats.find((c) => c.kind === "expense" && !c.parent)!._id;
    bank = await account("W2 bank");
    fund = await account("W2 fund", "investment", 0);
    console.log(`# signed up ${email}`);
});

// ---- Bills ------------------------------------------------------------------------------

test("bill pay ×3 at once: one payment, one debit, the rest 409", { skip }, async () => {
    const b = await newBill("Pay race", 3, true);
    const start = await balanceOf(bank);
    const r = await par(3, () => send("POST", `/bills/${b._id}/pay`, { account: bank }));
    assert.deepEqual(sorted(r), [200, 409, 409]);
    for (const x of r.filter((x) => x.status === 409)) failed(x, 409, "conflict", "This bill is already paid for this period");
    assert.equal(await balanceOf(bank), start - 200_000);
});

test("bill pay ×2 at once on a bill three months behind: still one payment", { skip }, async () => {
    const b = await newBill("Behind race", -90, true);
    const start = await balanceOf(bank);
    const r = await par(2, () => send("POST", `/bills/${b._id}/pay`, { account: bank }));
    assert.deepEqual(sorted(r), [200, 409]);
    assert.equal(await balanceOf(bank), start - 200_000);
    assert.equal(monthsBetween(b.dueDate, (await billById(b._id))!.dueDate), 1);
});

test("bill skip ×2 at once on an overdue bill: one period, not two", { skip }, async () => {
    const b = await newBill("Skip race", -40, true);
    const r = await par(2, () => send("POST", `/bills/${b._id}/skip`));
    assert.deepEqual(sorted(r), [200, 409]);
    assert.equal(monthsBetween(b.dueDate, (await billById(b._id))!.dueDate), 1);
});

test("bill pay and skip at once: the due date moves once per success, at most one payment", { skip }, async () => {
    const b = await newBill("Pay+skip", -10, true);
    const start = await balanceOf(bank);
    const [pay, skipped] = await Promise.all([send("POST", `/bills/${b._id}/pay`, { account: bank }), send("POST", `/bills/${b._id}/skip`)]);
    const ok = [pay, skipped].filter((x) => x.status === 200).length;
    assert.equal(ok, 1, `${pay.status} ${skipped.status}`);
    assert.equal(monthsBetween(b.dueDate, (await billById(b._id))!.dueDate), 1);
    assert.equal(await balanceOf(bank), pay.status === 200 ? start - 200_000 : start);
});

test("one-off bill paid twice: one payment, then 409", { skip }, async () => {
    const b = await newBill("One-off", 2, false);
    const start = await balanceOf(bank);
    assert.equal((await send("POST", `/bills/${b._id}/pay`, { account: bank })).status, 200);
    failed(await send("POST", `/bills/${b._id}/pay`, { account: bank }), 409, "conflict", "This bill is already paid for this period");
    assert.equal(await balanceOf(bank), start - 200_000);
    failed(await send("POST", `/bills/${b._id}/skip`), 409, "conflict", "Only recurring bills can be skipped");
});

test("a SIP bill pays into its holding", { skip }, async () => {
    const r = await send("POST", "/bills", billBody("SIP", 1, true, { category: null, toInvestment: fund }));
    assert.equal(r.status, 201);
    const start = await balanceOf(fund);
    assert.equal((await send("POST", `/bills/${r.json.data._id}/pay`)).status, 200);
    assert.equal(await balanceOf(fund), start + 200_000);
});

test("bill references: malformed, missing and wrong kind are 400 invalid_reference", { skip }, async () => {
    failed(await send("POST", "/bills", billBody("Bad account", 3, true, { account: MISSING })), 400, "invalid_reference", "Account isn't one of your accounts any more. Pick another");
    failed(await send("POST", "/bills", billBody("Bad account", 3, true, { account: "nope" })), 400, "invalid_reference");
    failed(await send("POST", "/bills", billBody("Bad cat", 3, true, { category: MISSING })), 400, "invalid_reference", "Category isn't one of your categories any more. Pick another");
    failed(await send("POST", "/bills", billBody("Not a fund", 3, true, { category: null, toInvestment: bank })), 400, "invalid_reference", "Investment isn't one of your holdings any more. Pick another");
    const b = await newBill("Pay from", 3, true);
    failed(await send("POST", `/bills/${b._id}/pay`, { account: MISSING }), 400, "invalid_reference");
    assert.equal((await send("POST", "/bills", billBody("From suggestion", 3, true, { account: bank }))).status, 201);
});

test("bill ids in the path: malformed or missing is 404, checked before the body's references", { skip }, async () => {
    for (const id of ["abc", MISSING]) {
        failed(await send("PATCH", `/bills/${id}`, { category: MISSING }), 404, "not_found", "That bill doesn't exist any more");
        failed(await send("POST", `/bills/${id}/pay`, { account: MISSING }), 404, "not_found");
        failed(await send("POST", `/bills/${id}/skip`), 404, "not_found");
        failed(await send("DELETE", `/bills/${id}`), 404, "not_found");
    }
});

test("bill update keeps the create rules: a one-off can't become recurring without a frequency", { skip }, async () => {
    const b = await newBill("Becomes recurring", 3, false);
    failed(await send("PATCH", `/bills/${b._id}`, { recurring: true }), 400, "invalid_input", "Pick how often this bill repeats");
    assert.equal((await send("PATCH", `/bills/${b._id}`, { recurring: true, frequency: "yearly" })).status, 200);
    failed(await send("POST", "/bills", { ...billBody("x", 3, true), frequency: undefined }), 400, "invalid_input", "Pick how often this bill repeats");
});

test("GET /bills?status=overdue lists the overdue bills only", { skip }, async () => {
    const late = await newBill("Late one", -5, true);
    const r = await send("GET", "/bills?status=overdue&foo=1");
    assert.equal(r.status, 200);
    assert.ok(r.json.data.length > 0 && r.json.data.every((b: { status: string }) => b.status === "overdue"));
    assert.ok(r.json.data.some((b: { _id: string }) => b._id === late._id));
    assert.ok(r.json.data.every((b: Record<string, unknown>) => !("userId" in b) && !("__v" in b)));
});

// ---- Goals ------------------------------------------------------------------------------

const goal = async (target = 10_000_000, extra: Record<string, unknown> = {}) => {
    const r = await send("POST", "/goals", { name: "W2 goal", target, icon: "star", color: "blue", ...extra });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return r.json.data as { _id: string; deadline?: string | null };
};
const savedOf = async (id: string) => ((await send("GET", "/goals")).json.data as { _id: string; saved: number }[]).find((g) => g._id === id)!.saved;

test("goal contribute ×5 at once: every one counts", { skip }, async () => {
    const g = await goal();
    const r = await par(5, () => send("POST", `/goals/${g._id}/contribute`, { amount: 100_000 }));
    assert.deepEqual(sorted(r), [200, 200, 200, 200, 200]);
    assert.equal(await savedOf(g._id), 500_000);
});

test("goal contribute twice one after the other adds twice (a retry needs R2's key)", { skip }, async () => {
    const g = await goal();
    await send("POST", `/goals/${g._id}/contribute`, { amount: 100_000 });
    await send("POST", `/goals/${g._id}/contribute`, { amount: 100_000 });
    assert.equal(await savedOf(g._id), 200_000);
});

test("goal contribute stops at the target, in parallel too", { skip }, async () => {
    const g = await goal(250_000);
    await par(4, () => send("POST", `/goals/${g._id}/contribute`, { amount: 100_000 }));
    assert.equal(await savedOf(g._id), 250_000);
});

test("goal deadline null is stored as null, not 1970", { skip }, async () => {
    const g = await goal(1_000, { deadline: null });
    assert.equal(g.deadline, null);
    const listed = ((await send("GET", "/goals")).json.data as { _id: string; deadline?: string | null }[]).find((x) => x._id === g._id)!;
    assert.equal(listed.deadline ?? null, null);
});

test("goal paths and bodies", { skip }, async () => {
    for (const id of ["abc", MISSING]) {
        failed(await send("POST", `/goals/${id}/contribute`, { amount: 1 }), 404, "not_found", "That goal doesn't exist any more");
        failed(await send("PATCH", `/goals/${id}`, { name: "x" }), 404, "not_found");
        failed(await send("DELETE", `/goals/${id}`), 404, "not_found");
    }
    const g = await goal();
    failed(await send("POST", `/goals/${g._id}/contribute`, { amount: 0 }), 400, "invalid_input", "Amount must be more than zero");
    failed(await send("POST", `/goals/${g._id}/contribute`, { amount: 1, note: "x" }), 400, "invalid_input", MESSAGES.unexpectedField);
    failed(await send("POST", "/goals", {}), 400, "invalid_input");
});

// ---- Budgets ----------------------------------------------------------------------------

test("budget create ×2 at once: one budget, the other 409 duplicate", { skip }, async () => {
    const month = "2026-03";
    const r = await par(2, () => send("POST", "/budgets", { category: cat, month, limit: 100_000 }));
    assert.deepEqual(sorted(r), [201, 409]);
    failed(r.find((x) => x.status === 409)!, 409, "duplicate", "You already have a budget for this category this month");
    failed(await send("POST", "/budgets", { category: cat, month, limit: 100_000 }), 409, "duplicate");
    const listed = (await send("GET", `/budgets?month=${month}`)).json.data as { budget: Record<string, unknown>; spent: number }[];
    assert.equal(listed.length, 1);
    assert.ok(!("userId" in listed[0].budget) && typeof listed[0].spent === "number");
});

test("budget references and paths", { skip }, async () => {
    failed(await send("POST", "/budgets", { category: MISSING, month: "2026-04", limit: 1 }), 400, "invalid_reference", "Category isn't one of your categories any more. Pick another");
    failed(await send("POST", "/budgets", { category: "abc", month: "2026-04", limit: 1 }), 400, "invalid_reference");
    for (const id of ["abc", MISSING]) {
        failed(await send("PATCH", `/budgets/${id}`, { limit: 1 }), 404, "not_found", "That budget doesn't exist any more");
        failed(await send("DELETE", `/budgets/${id}`), 404, "not_found");
    }
    failed(await send("GET", "/budgets?month=May"), 400, "invalid_input");
});

// ---- Notifications, recurring, cash flow --------------------------------------------------

test("notifications keep the 2.6.0 fields", { skip }, async () => {
    const r = await send("GET", "/notifications?page=1&limit=20");
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.json.data).sort(), ["hasNextPage", "items", "page", "unread"]);
    failed(await send("GET", "/notifications?page=0"), 400, "invalid_input");
    for (const id of ["abc", MISSING]) failed(await send("PATCH", `/notifications/${id}/read`), 404, "not_found", "That notification doesn't exist any more");
    const all = await send("POST", "/notifications/read-all");
    assert.equal(all.status, 200);
    assert.deepEqual(all.json.data, { unread: 0 });
});

test("recurring dismiss and cash flow", { skip }, async () => {
    assert.equal((await send("POST", "/recurring/dismiss", { key: "w2|1" })).status, 200);
    assert.equal((await send("POST", "/recurring/dismiss", { key: "w2|1" })).status, 200);
    failed(await send("POST", "/recurring/dismiss", {}), 400, "invalid_input", "Suggestion is required");
    assert.equal((await send("GET", "/recurring")).status, 200);
    assert.equal((await send("GET", "/cash-flow")).status, 200);
});
