import { before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "crypto";
import { ObjectId } from "mongodb";
import { PASSWORD, useTestApi, type Reply, type TestApi, type TestUser } from "../harness";
import app from "../../src/app";
import { notify } from "../../src/services/notificationService";
import { MESSAGES } from "../../src/utils/messages";
import { MALFORMED, MISSING, failed, replayed, signedOut } from "./moneyChecks";

// Every route Express has mounted, read from the app's own router stack, checked the same way:
// signed out, malformed and missing ids, another user's ids, unknown body fields, and
// Idempotency-Key where the route takes one. A route added later fails "every mounted route has
// a spec" until it is described below, so it can't slip past these checks. Which routes are
// public and which take a key is found by asking each route, not by reading its middleware:
// express-async-errors wraps every handler, so the stack can't be compared with `protect`.

const api = useTestApi();

// ---- The routes, from the router ----------------------------------------------------------------

type Layer = {
    name: string;
    handle: { stack?: Layer[] };
    regexp: RegExp & { fast_slash?: boolean };
    route?: { path: unknown; methods: Record<string, boolean> };
};
type Route = { key: string; method: string; path: string };

/** "/v1" from the regexp `router.use("/v1", …)` compiles to. Refuses anything but a plain path. */
const mountPath = (layer: Layer): string => {
    if (layer.regexp.fast_slash) return "";
    const m = /^\^((?:\\\/[\w-]+)+)\\\/\?\(\?=\\\/\|\$\)$/.exec(layer.regexp.source);
    assert.ok(m, `can't read the mount path of ${layer.regexp}`);
    return m[1].replace(/\\\//g, "/");
};

const walk = (stack: Layer[], prefix = ""): Route[] => stack.flatMap((layer): Route[] => {
    if (layer.route) {
        const { path, methods } = layer.route;
        assert.equal(typeof path, "string", `route ${String(path)} under ${prefix} isn't a plain path`);
        const full = `${prefix}${path === "/" && prefix ? "" : path}`;
        return Object.keys(methods).filter((m) => methods[m] && m !== "_all").map((m) => ({ key: `${m.toUpperCase()} ${full}`, method: m.toUpperCase(), path: full }));
    }
    if (layer.name === "router") return walk(layer.handle.stack!, prefix + mountPath(layer));
    return [];
});

const ROUTES = walk((app as unknown as { _router: { stack: Layer[] } })._router.stack);
const isPublic = (r: Route) => PUBLIC.has(r.key);
const isWrite = (r: Route) => r.method !== "GET";
const params = (r: Route) => [...r.path.matchAll(/:(\w+)/g)].map((m) => m[1]);
const BASE = "/api/v1";
/** The harness sends paths after /api/v1. */
const rel = (path: string) => (path.startsWith(BASE) ? path.slice(BASE.length) : path);

/**
 * The only routes that answer without a token. Anything else that does is a failure.
 * - /health: Render's uptime ping and the app's wake poll, before anyone signs in.
 * - register, login: how a token is got.
 * - client-errors: a crash can happen on the sign-in screen (capped per IP instead).
 */
const PUBLIC = new Set([
    "GET /health",
    "POST /api/v1/auth/register",
    "POST /api/v1/auth/login",
    "POST /api/v1/diagnostics/client-errors",
]);

// ---- One user's records, so a path or a body can name them --------------------------------------

type Ctx = {
    user: TestUser; bank: string; person: string; invest: string; cat: string; myCat: string; tx: string; bill: string;
    budget: string; goal: string; notification: string; trip: string; tripExpense: string; backup: Record<string, unknown>;
};
type IdKey = Exclude<keyof Ctx, "user" | "backup">;

const iso = (daysFromNow = 0) => new Date(Date.now() + daysFromNow * 86_400_000).toISOString();
const thisMonth = () => new Date().toISOString().slice(0, 7);
const tripDraft = (c: Ctx, name = "Matrix trip") => ({ name, startDate: iso(-3), endDate: iso(2), members: [c.person], budget: null });
const youPaid = (c: Ctx, cost = 90_000) => ({
    title: "Matrix dinner", occurredAt: iso(), category: null, cost, paidBy: null, paidFrom: c.bank,
    shares: [{ account: null, amount: cost / 2 }, { account: c.person, amount: cost / 2 }],
});
const expense = (c: Ctx, amount = 5_000) => ({ type: "expense", amount, account: c.bank, category: c.cat, title: "Matrix lunch", occurredAt: iso() });
const CSV = (me: string, friend: string) => [
    `Date,Description,Category,Cost,Currency,${me},${friend}`, "",
    `${iso(-1).slice(0, 10)},Matrix cab,Taxi,600.00,INR,-300.00,300.00`,
].join("\n");

const created = async (u: TestUser, path: string, body: unknown): Promise<string> => {
    const r = await u.send("POST", path, body);
    assert.ok(r.status === 200 || r.status === 201, `${path}: ${r.status} ${r.text.slice(0, 300)}`);
    return r.json.data._id as string;
};

const seed = async (u: TestUser): Promise<Ctx> => {
    const bank = await u.account("Matrix bank", { startingBalance: 10_000_000 });
    const person = await u.account("Matrix Asha", { type: "person", startingBalance: 0 });
    const invest = await u.account("Matrix fund", { type: "investment", startingBalance: 100_000 });
    const cat = await u.category("expense");
    const myCat = await created(u, "/categories", { name: "Matrix category", kind: "expense" });
    const c = { user: u, bank, person, invest, cat, myCat } as Ctx;
    c.tx = await created(u, "/transactions", expense(c));
    c.bill = await created(u, "/bills", { name: "Matrix rent", amount: 100_000, dueDate: iso(5) });
    c.budget = await created(u, "/budgets", { category: myCat, month: thisMonth(), limit: 100_000 });
    c.goal = await created(u, "/goals", { name: "Matrix goal", target: 1_000_000 });
    // Notifications are only ever raised by the server; this is the notifier those use.
    assert.equal(await notify({ _id: u.id }, { type: "billReminder", title: "Matrix bill due", body: "Due soon", dedupeKey: `matrix:${u.id}` }), true);
    c.notification = String((await api.ro.col("notifications").find<{ _id: ObjectId }>({ userId: new ObjectId(u.id) }))[0]._id);
    c.trip = await created(u, "/trips", tripDraft(c));
    c.tripExpense = await created(u, `/trips/${c.trip}/expenses`, youPaid(c));
    c.backup = (await u.send("GET", "/backup")).json.data;
    return c;
};

/** The record a path parameter names, by the segment in front of it. */
const OWNER: Record<string, IdKey> = {
    accounts: "bank", categories: "myCat", category: "myCat", transactions: "tx", bills: "bill", budgets: "budget",
    goals: "goal", notifications: "notification", investments: "invest", trips: "trip", expenses: "tripExpense",
};
const ownerOf = (r: Route, param: string): IdKey => {
    const parts = r.path.split("/");
    const owner = OWNER[parts[parts.indexOf(`:${param}`) - 1]];
    assert.ok(owner, `${r.key}: which record does :${param} name? Add it to OWNER`);
    return owner;
};
/** The route's path with each parameter filled by `fill(param)`, plus the route's own query. */
const pathFor = (r: Route, fill: (param: string) => string) =>
    rel(r.path.replace(/:(\w+)/g, (_, p: string) => fill(p))) + (SPECS[r.key]?.query ?? "");

// ---- What each route needs ------------------------------------------------------------------------

/** `as`: sent as this user instead of the test's own. */
type Keyed = { path: string; body?: unknown; other: { path?: string; body?: unknown }; as?: TestUser };
type Spec = {
    /** A body the route accepts, built from the sender's own records. */
    body?: (c: Ctx) => unknown;
    /** A query the route requires. */
    query?: string;
    /** For a route that takes Idempotency-Key: a request that succeeds, and one that differs. */
    keyed?: (c: Ctx) => Promise<Keyed>;
};

const SPECS: Record<string, Spec> = {
    "GET /health": {},

    "POST /api/v1/auth/register": { body: () => ({ name: "Matrix", email: `matrix-${randomBytes(3).toString("hex")}@example.test`, password: "matrix-pass-1" }) },
    "POST /api/v1/auth/login": { body: (c) => ({ email: c.user.email, password: PASSWORD }) },
    "GET /api/v1/auth/me": {},
    "POST /api/v1/auth/change-password": { body: () => ({ currentPassword: PASSWORD, newPassword: "matrix-other-1" }) },

    "GET /api/v1/users/me": {},
    "PATCH /api/v1/users/me": { body: () => ({ name: "Matrix renamed" }) },
    "DELETE /api/v1/users/me": {},

    "GET /api/v1/accounts": {},
    "POST /api/v1/accounts": {
        body: () => ({ name: "Matrix new", type: "bank", startingBalance: 0 }),
        keyed: async () => ({ path: "/accounts", body: { name: "Keyed", type: "bank", startingBalance: 100 }, other: { body: { name: "Keyed 2", type: "bank", startingBalance: 100 } } }),
    },
    "PATCH /api/v1/accounts/reorder": { body: (c) => ({ ids: [c.bank] }) },
    "GET /api/v1/accounts/:id": {},
    "PATCH /api/v1/accounts/:id": { body: () => ({ name: "Matrix renamed" }) },
    "PATCH /api/v1/accounts/:id/balance": {
        body: () => ({ balance: 9_000_000 }),
        keyed: async (c) => {
            const id = await c.user.account("Keyed sync", { startingBalance: 1_000 });
            return { path: `/accounts/${id}/balance`, body: { balance: 1_500 }, other: { body: { balance: 2_000 } } };
        },
    },
    "DELETE /api/v1/accounts/:id": {},

    "GET /api/v1/categories": {},
    "POST /api/v1/categories": {
        body: () => ({ name: "Matrix new category", kind: "expense" }),
        keyed: async () => ({ path: "/categories", body: { name: "Keyed category", kind: "expense" }, other: { body: { name: "Keyed category 2", kind: "expense" } } }),
    },
    "PATCH /api/v1/categories/reorder": { body: (c) => ({ ids: [c.myCat] }) },
    "GET /api/v1/categories/:id": {},
    "PATCH /api/v1/categories/:id": { body: () => ({ name: "Matrix renamed" }) },
    "DELETE /api/v1/categories/:id": {},

    "GET /api/v1/transactions": {},
    "POST /api/v1/transactions": {
        body: (c) => expense(c),
        keyed: async (c) => ({ path: "/transactions", body: expense(c, 1_000), other: { body: expense(c, 2_000) } }),
    },
    "POST /api/v1/transactions/convert-to-investment": {
        body: (c) => ({ transactionIds: [c.tx], toAccount: c.invest }),
        keyed: async (c) => {
            const [a, b] = [await created(c.user, "/transactions", expense(c)), await created(c.user, "/transactions", expense(c))];
            return { path: "/transactions/convert-to-investment", body: { transactionIds: [a], toAccount: c.invest }, other: { body: { transactionIds: [b], toAccount: c.invest } } };
        },
    },
    "GET /api/v1/transactions/summary": {},
    "GET /api/v1/transactions/title-suggestions": {},
    "GET /api/v1/transactions/:id": {},
    "PATCH /api/v1/transactions/:id": {
        body: () => ({ amount: 6_000 }),
        keyed: async (c) => ({ path: `/transactions/${await created(c.user, "/transactions", expense(c))}`, body: { amount: 7_000 }, other: { body: { amount: 8_000 } } }),
    },
    "POST /api/v1/transactions/:id/convert-to-investment": {
        body: (c) => ({ toAccount: c.invest }),
        keyed: async (c) => ({ path: `/transactions/${await created(c.user, "/transactions", expense(c))}/convert-to-investment`, body: { toAccount: c.invest }, other: { path: `/transactions/${MISSING}/convert-to-investment` } }),
    },
    "DELETE /api/v1/transactions/:id": {
        keyed: async (c) => ({ path: `/transactions/${await created(c.user, "/transactions", expense(c))}`, other: { path: `/transactions/${MISSING}` } }),
    },

    "GET /api/v1/dashboard/summary": {},
    "GET /api/v1/dashboard/health": {},
    "GET /api/v1/dashboard/insights": {},

    "GET /api/v1/budgets": {},
    "POST /api/v1/budgets": {
        body: (c) => ({ category: c.cat, month: thisMonth(), limit: 1_000 }),
        keyed: async (c) => {
            const category = await created(c.user, "/categories", { name: "Keyed budget category", kind: "expense" });
            return { path: "/budgets", body: { category, month: thisMonth(), limit: 1_000 }, other: { body: { category, month: thisMonth(), limit: 2_000 } } };
        },
    },
    "PATCH /api/v1/budgets/:id": { body: () => ({ limit: 2_000 }) },
    "DELETE /api/v1/budgets/:id": {},

    "GET /api/v1/bills": {},
    "POST /api/v1/bills": {
        body: () => ({ name: "Matrix bill", amount: 1_000, dueDate: iso(3) }),
        keyed: async () => ({ path: "/bills", body: { name: "Keyed bill", amount: 1_000, dueDate: iso(3) }, other: { body: { name: "Keyed bill", amount: 2_000, dueDate: iso(3) } } }),
    },
    "PATCH /api/v1/bills/:id": { body: () => ({ name: "Matrix renamed" }) },
    "DELETE /api/v1/bills/:id": {},
    "POST /api/v1/bills/:id/pay": {
        body: (c) => ({ account: c.bank }),
        keyed: async (c) => ({ path: `/bills/${await created(c.user, "/bills", { name: "Keyed pay", amount: 1_000, dueDate: iso(3) })}/pay`, body: { account: c.bank }, other: { body: {} } }),
    },
    "POST /api/v1/bills/:id/skip": {
        body: () => ({}),
        keyed: async (c) => ({ path: `/bills/${await created(c.user, "/bills", { name: "Keyed skip", amount: 1_000, dueDate: iso(3), recurring: true, frequency: "monthly" })}/skip`, body: {}, other: { path: `/bills/${MISSING}/skip` } }),
    },

    "GET /api/v1/goals": {},
    "POST /api/v1/goals": {
        body: () => ({ name: "Matrix goal 2", target: 1_000 }),
        keyed: async () => ({ path: "/goals", body: { name: "Keyed goal", target: 1_000 }, other: { body: { name: "Keyed goal", target: 2_000 } } }),
    },
    "PATCH /api/v1/goals/:id": { body: () => ({ name: "Matrix renamed" }) },
    "DELETE /api/v1/goals/:id": {},
    "POST /api/v1/goals/:id/contribute": {
        body: () => ({ amount: 100 }),
        keyed: async (c) => ({ path: `/goals/${await created(c.user, "/goals", { name: "Keyed contribute", target: 10_000 })}/contribute`, body: { amount: 100 }, other: { body: { amount: 200 } } }),
    },

    "GET /api/v1/insights": {},
    "GET /api/v1/insights/category/:id": {},

    "GET /api/v1/notifications": {},
    "POST /api/v1/notifications/read-all": { body: () => ({}) },
    "PATCH /api/v1/notifications/:id/read": { body: () => ({}) },

    "GET /api/v1/highlights": {},
    "GET /api/v1/highlights/history": {},

    "GET /api/v1/backup": {},
    "POST /api/v1/backup/restore": {
        body: (c) => ({ ...c.backup, confirm: true }),
        // Its own user: a restore replaces everything the user has.
        keyed: async () => {
            const u = await api.user("matrix-restore");
            const backup = (await u.send("GET", "/backup")).json.data;
            return { path: "/backup/restore", body: { ...backup, confirm: true }, other: { body: { ...backup, exportedAt: iso(-1), confirm: true } }, as: u };
        },
    },

    "GET /api/v1/reviews": {},

    "GET /api/v1/investments": {},
    "GET /api/v1/investments/trend": {},
    "GET /api/v1/investments/report": {},
    "GET /api/v1/investments/:id/history": {},
    "PATCH /api/v1/investments/:id/basis": {
        body: () => ({ invested: 120_000 }),
        keyed: async (c) => {
            const id = await c.user.account("Keyed basis", { type: "investment", startingBalance: 100_000 });
            return { path: `/investments/${id}/basis`, body: { invested: 120_000 }, other: { body: { invested: 130_000 } } };
        },
    },
    "DELETE /api/v1/investments/:id": {
        query: "?mode=keep",
        keyed: async (c) => {
            const id = await c.user.account("Keyed delete", { type: "investment", startingBalance: 100_000 });
            return { path: `/investments/${id}?mode=keep`, other: { path: `/investments/${id}?mode=undo` } };
        },
    },

    "GET /api/v1/recurring": {},
    "POST /api/v1/recurring/dismiss": { body: () => ({ key: "matrix" }) },

    "GET /api/v1/cash-flow": {},

    "POST /api/v1/diagnostics/client-errors": { body: () => ({ message: "Matrix probe" }) },
    "GET /api/v1/diagnostics/requests": {},

    "GET /api/v1/trips": {},
    "POST /api/v1/trips": {
        body: (c) => tripDraft(c),
        keyed: async (c) => ({ path: "/trips", body: tripDraft(c, "Keyed trip"), other: { body: tripDraft(c, "Keyed trip 2") } }),
    },
    "GET /api/v1/trips/:id": {},
    "PATCH /api/v1/trips/:id": { body: () => ({ name: "Matrix renamed" }) },
    "DELETE /api/v1/trips/:id": {
        keyed: async (c) => ({ path: `/trips/${await created(c.user, "/trips", tripDraft(c))}`, other: { path: `/trips/${MISSING}` } }),
    },
    "POST /api/v1/trips/:id/expenses": {
        body: (c) => youPaid(c),
        keyed: async (c) => {
            const t = await created(c.user, "/trips", tripDraft(c));
            return { path: `/trips/${t}/expenses`, body: youPaid(c, 2_000), other: { body: youPaid(c, 4_000) } };
        },
    },
    "PATCH /api/v1/trips/:id/expenses/:expenseId": {
        body: (c) => youPaid(c, 80_000),
        keyed: async (c) => {
            const t = await created(c.user, "/trips", tripDraft(c));
            const e = await created(c.user, `/trips/${t}/expenses`, youPaid(c, 2_000));
            return { path: `/trips/${t}/expenses/${e}`, body: youPaid(c, 4_000), other: { body: youPaid(c, 6_000) } };
        },
    },
    "DELETE /api/v1/trips/:id/expenses/:expenseId": {
        keyed: async (c) => {
            const t = await created(c.user, "/trips", tripDraft(c));
            const e = await created(c.user, `/trips/${t}/expenses`, youPaid(c, 2_000));
            return { path: `/trips/${t}/expenses/${e}`, other: { path: `/trips/${t}/expenses/${MISSING}` } };
        },
    },
    "POST /api/v1/trips/:id/settle": {
        body: (c) => ({ person: c.person, account: c.bank, amount: 100, direction: "received" }),
        keyed: async (c) => {
            const t = await created(c.user, "/trips", tripDraft(c));
            const body = { person: c.person, account: c.bank, amount: 100, direction: "received" };
            return { path: `/trips/${t}/settle`, body, other: { body: { ...body, amount: 200 } } };
        },
    },
    "PUT /api/v1/trips/:id/plan": {
        body: () => ({ entries: [] }),
        keyed: async (c) => {
            const t = await created(c.user, "/trips", tripDraft(c));
            await created(c.user, `/trips/${t}/expenses`, youPaid(c, 2_000));
            return { path: `/trips/${t}/plan`, body: { entries: [{ account: c.person, amount: 1_000 }] }, other: { body: { entries: [] } } };
        },
    },
    "DELETE /api/v1/trips/:id/plan": {
        keyed: async (c) => {
            const t = await created(c.user, "/trips", tripDraft(c));
            await created(c.user, `/trips/${t}/expenses`, youPaid(c, 2_000));
            assert.equal((await c.user.send("PUT", `/trips/${t}/plan`, { entries: [{ account: c.person, amount: 1_000 }] })).status, 200);
            return { path: `/trips/${t}/plan`, other: { path: `/trips/${MISSING}/plan` } };
        },
    },
    "POST /api/v1/trips/:id/close": {
        body: () => ({ letGo: [] }),
        keyed: async (c) => ({ path: `/trips/${await created(c.user, "/trips", tripDraft(c))}/close`, body: { letGo: [] }, other: { body: { letGo: [c.person] } } }),
    },
    "POST /api/v1/trips/:id/reopen": { body: () => ({}) },
    "PATCH /api/v1/trips/:id/close-date": { body: () => ({ closedOn: "2026-01-01" }) },
    "POST /api/v1/trips/:id/import/preview": { body: () => ({ csv: CSV("Test Runner", "Matrix Asha") }) },
    "POST /api/v1/trips/:id/import/commit": {
        body: (c) => ({ csv: CSV("Test Runner", "Matrix Asha"), mapping: { "Test Runner": "me", "Matrix Asha": c.person }, decisions: [] }),
        keyed: async (c) => {
            const t = await created(c.user, "/trips", tripDraft(c));
            const csv = CSV("Test Runner", "Matrix Asha");
            const mapping = { "Test Runner": "me", "Matrix Asha": c.person };
            const pre = await c.user.send("POST", `/trips/${t}/import/preview`, { csv, mapping });
            assert.equal(pre.status, 200, pre.text);
            const decisions = (pre.json.data.rows as { key: string }[]).map((r) => ({ key: r.key, action: "import" }));
            return { path: `/trips/${t}/import/commit`, body: { csv, mapping, decisions }, other: { body: { csv, mapping, decisions: [] } } };
        },
    },
};

/** Collections that hold a user's data, keyed by the field that says whose. */
const OWNED: [Parameters<TestApi["ro"]["col"]>[0], string][] = [
    ["users", "_id"], ["accounts", "userId"], ["transactions", "userId"], ["categories", "userId"], ["goals", "userId"],
    ["goalcontributionlogs", "userId"], ["bills", "userId"], ["budgets", "userId"], ["trips", "userId"], ["tripexpenses", "userId"],
    ["notifications", "userId"], ["highlightlogs", "userId"], ["recurringdismissals", "userId"], ["idempotencyrecords", "userId"],
];
/** Everything stored for one user, sorted, as text. Request logs are left out: they are written after the reply. */
const snapshot = async (userId: string) => JSON.stringify(await Promise.all(OWNED.map(async ([col, field]) =>
    (await api.ro.col(col).find<{ _id: ObjectId }>({ [field]: new ObjectId(userId) })).sort((x, y) => String(x._id).localeCompare(String(y._id))))));

let a: Ctx;
let b: Ctx;

before(async () => {
    await api.ready();
    a = await seed(await api.user("matrix-a"));
    b = await seed(await api.user("matrix-b"));
});

const spec = (r: Route) => SPECS[r.key] ?? {};
const bodyFor = (r: Route, c: Ctx) => spec(r).body?.(c);
/** Writes only; a GET never carries a body. /health is outside /api/v1, so it goes by fetch. */
const sendAs = async (u: TestUser | null, r: Route, path: string, body?: unknown, headers?: Record<string, string>): Promise<Reply> => {
    if (!r.path.startsWith(BASE)) {
        const res = await fetch(`${api.base}${path}`, { method: r.method, headers });
        const text = await res.text();
        return { status: res.status, json: JSON.parse(text), text, headers: res.headers, ms: 0 };
    }
    return u ? u.send(r.method, path, isWrite(r) ? body : undefined, { headers }) : api.send(r.method, path, isWrite(r) ? body : undefined, { headers });
};

// ---- The checks ---------------------------------------------------------------------------------

/** The routes that answered a malformed Idempotency-Key with 400, found by the probe below. */
let KEYED: Set<string> | undefined;
const isKeyed = (r: Route) => { assert.ok(KEYED, "the Idempotency-Key probe didn't run"); return KEYED.has(r.key); };

test("every mounted route has a spec, and every spec a route", () => {
    const keys = ROUTES.map((r) => r.key);
    assert.equal(new Set(keys).size, keys.length, "a route is mounted twice");
    assert.deepEqual(keys.filter((k) => !(k in SPECS)), [], "routes with no spec: add them to SPECS");
    assert.deepEqual(Object.keys(SPECS).filter((k) => !keys.includes(k)), [], "specs with no route");
    for (const r of ROUTES) if (r.method !== "GET" && r.method !== "DELETE") assert.ok(spec(r).body, `${r.key}: a write needs a body in its spec`);
    assert.ok(keys.includes("GET /health") && keys.includes("POST /api/v1/trips/:id/import/commit"), "the walk missed part of the app");
});

test("Idempotency-Key: exactly the routes with a keyed fixture refuse a malformed key", async () => {
    // A throwaway user: with a bad key, a route that ignores the header runs (ids in the path are
    // missing ones, so only the id-less writes do anything). DELETE /users/me goes last.
    const p = await seed(await api.user("matrix-probe"));
    const order = [...ROUTES].sort((x, y) => Number(x.key === "DELETE /api/v1/users/me") - Number(y.key === "DELETE /api/v1/users/me"));
    KEYED = new Set();
    for (const r of order) {
        const res = await sendAs(p.user, r, pathFor(r, () => MISSING), bodyFor(r, p), { "Idempotency-Key": "not a key!" });
        if (res.status === 400 && res.json?.issues?.[0]?.path === "Idempotency-Key") KEYED.add(r.key);
        api.resetLimits();
    }
    const fixtures = ROUTES.filter((r) => spec(r).keyed).map((r) => r.key);
    assert.deepEqual([...KEYED].sort(), fixtures.sort(), "a route takes Idempotency-Key with no keyed fixture, or the other way round");
    console.log(`# ${ROUTES.length} routes: ${KEYED.size} take Idempotency-Key, ${ROUTES.filter((r) => params(r).length).length} have ids in the path, ${PUBLIC.size} are public`);
});

test("signed out: every route but the allowlist is 401 with the error shape; the allowlist answers", async () => {
    for (const r of ROUTES) {
        const path = pathFor(r, (q) => a[ownerOf(r, q)]);
        if (isPublic(r)) {
            const res = await sendAs(null, r, path, bodyFor(r, a));
            assert.ok(res.status < 400, `${r.key} is public but answered ${res.status} ${res.text.slice(0, 200)}`);
        }
        else await signedOut(api, r.method, path, isWrite(r) ? bodyFor(r, a) : undefined);
        api.resetLimits(); // the sign-in limiter runs before protect on change-password
    }
    const health = await fetch(`${api.base}/health`);
    assert.deepEqual(Object.keys((await health.json()) as object).sort(), ["db", "ok"]);
});

test("lists and reports: another user's records never appear in a GET", async () => {
    const theirs = [a.user.email, a.user.id, a.bank, a.person, a.invest, a.myCat, a.tx, a.bill, a.budget, a.goal, a.notification, a.trip, a.tripExpense];
    for (const r of ROUTES.filter((x) => x.method === "GET" && !isPublic(x) && !params(x).length)) {
        const res = await b.user.send("GET", rel(r.path));
        assert.equal(res.status, 200, `${r.key}: ${res.status} ${res.text.slice(0, 300)}`);
        for (const id of theirs) assert.ok(!res.text.includes(id), `${r.key} sends another user's ${id}`);
    }
});

test("ids in the path: malformed and missing are 404 not_found, never a 400 or a 500", async () => {
    for (const r of ROUTES.filter((x) => params(x).length)) {
        for (const bad of [MALFORMED, MISSING]) {
            for (const p of params(r)) {
                const res = await sendAs(b.user, r, pathFor(r, (q) => (q === p ? bad : b[ownerOf(r, q)])), bodyFor(r, b));
                failed(res, 404, "not_found");
            }
        }
    }
});

test("another user's ids: 404 not_found on every route, and nothing of theirs changes", async () => {
    const before = await snapshot(a.user.id);
    for (const r of ROUTES.filter((x) => params(x).length)) {
        const ps = params(r);
        // Every mix with at least one of theirs: (theirs, theirs), (mine, theirs), (theirs, mine).
        for (let mask = 1; mask < 2 ** ps.length; mask += 1) {
            const path = pathFor(r, (p) => ((mask >> ps.indexOf(p)) & 1 ? a : b)[ownerOf(r, p)]);
            const res = await sendAs(b.user, r, path, bodyFor(r, b));
            failed(res, 404, "not_found");
            assert.ok(!res.text.includes(a.user.email), `${r.key} names the other user`);
        }
    }
    assert.equal(await snapshot(a.user.id), before, "another user's data changed");
});

test("unknown body fields: every POST, PATCH and PUT is 400 invalid_input; a DELETE ignores a body", async () => {
    const before = await snapshot(b.user.id);
    for (const r of ROUTES.filter(isWrite)) {
        // Missing ids, so nothing is written whatever the route does with the body.
        const path = pathFor(r, () => MISSING);
        const u = isPublic(r) ? null : b.user;
        if (r.method === "DELETE") {
            // DELETE /users/me has no id to miss: sent, it would close the account.
            if (!params(r).length) continue;
            failed(await sendAs(u, r, path, { unexpected: 1 }), 404, "not_found");
            continue;
        }
        const res = await sendAs(u, r, path, { ...(bodyFor(r, b) as object), unexpected: 1 });
        failed(res, 400, "invalid_input", { message: MESSAGES.unexpectedField });
        assert.equal(res.json.issues.length, 1, `${r.key}: the spec body has another problem: ${res.text}`);
        api.resetLimits();
    }
    assert.equal(await snapshot(b.user.id), before);
});

test("Idempotency-Key: a malformed key is refused on real records before anything runs", async () => {
    const before = await snapshot(b.user.id);
    for (const r of ROUTES.filter(isKeyed)) {
        const res = await sendAs(b.user, r, pathFor(r, (p) => b[ownerOf(r, p)]), bodyFor(r, b), { "Idempotency-Key": "not a key!" });
        failed(res, 400, "invalid_input", { path: "Idempotency-Key" });
        api.resetLimits();
    }
    assert.equal(await snapshot(b.user.id), before);
});

test("Idempotency-Key: on every keyed route a replay is the first reply with the header; another body or path is 422", async () => {
    const c = await seed(await api.user("matrix-keyed"));
    for (const r of ROUTES.filter(isKeyed)) {
        const k = await spec(r).keyed!(c);
        await replayed(api, (k.as ?? c.user).send, r.method, k.path, k.body, k.other).catch((e: Error) => { throw new Error(`${r.key}: ${e.message}`); });
        api.resetLimits();
    }
});
