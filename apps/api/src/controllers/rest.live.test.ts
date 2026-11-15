import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { randomBytes } from "crypto";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { MongoClient, ObjectId } from "mongodb";
import { styleProblems } from "../utils/messages";
import { buildUri } from "../config/db";

// HTTP tests for sign-in, users, categories, backup, diagnostics, dashboard, insights, reviews
// and highlights, against a LOCAL dev API (reminders off). They need a running server, so they
// are not in `npm test`:
//
//   cd apps/api && DISABLE_REMINDERS=true PORT=7232 node -r ts-node/register src/server.ts
//   API_BASE=http://127.0.0.1:7232 node -r ts-node/register --test src/controllers/rest.live.test.ts
//
// Each run signs up two new throwaway @example.test users and touches nobody else. It makes 10
// sign-in requests, the auth limiter's whole 15-minute allowance: start a fresh API per run. Stored
// state is checked read-only (find only) in the dev database.

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const BASE = process.env.API_BASE;
const skip = BASE ? false : "set API_BASE to a local dev API to run these";
if (BASE && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE)) throw new Error(`Refusing ${BASE}: local API only`);

type Reply = { status: number; json: any };
type User = { email: string; password: string; token: string; id: string };

const call = async (method: string, p: string, body?: unknown, token?: string): Promise<Reply> => {
    const res = await fetch(`${BASE}/api/v1${p}`, {
        method,
        headers: { "Content-Type": "application/json", "X-App-Version": "2.6.0", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, json: await res.json().catch(() => null) };
};

const failed = (r: Reply, status: number, code: string, message?: string) => {
    assert.equal(r.status, status, JSON.stringify(r.json));
    assert.equal(r.json.code, code, JSON.stringify(r.json));
    assert.deepEqual(styleProblems(r.json.message), [], r.json.message);
    if (message) assert.equal(r.json.message, message);
};

const PASSWORD = "w4-pass-1234";
const signUp = async (tag: string): Promise<User> => {
    const email = `w4-${tag}-${Date.now().toString(36)}-${randomBytes(2).toString("hex")}@example.test`;
    const reg = await call("POST", "/auth/register", { name: "W4 Runner", email, password: PASSWORD, timeZone: "Asia/Kolkata" });
    assert.equal(reg.status, 201, JSON.stringify(reg.json));
    const login = await call("POST", "/auth/login", { email, password: PASSWORD });
    assert.equal(login.status, 200, JSON.stringify(login.json));
    return { email, password: PASSWORD, token: login.json.data.accessToken, id: reg.json.data._id };
};

let a: User;
let b: User;
let mongo: MongoClient | undefined;
/** Read-only: `find` and `countDocuments` only. */
const ro = {
    col: (name: "users" | "categories") => ({
        find: <T>(q: Record<string, unknown>) => mongo!.db("save-n-spend-dev").collection(name).find(q).toArray() as unknown as Promise<T[]>,
        count: (q: Record<string, unknown>) => mongo!.db("save-n-spend-dev").collection(name).countDocuments(q),
    }),
};
const as = (u: User) => (method: string, p: string, body?: unknown) => call(method, p, body, u.token);
const storedUser = async (u: User) => (await ro.col("users").find<Record<string, any>>({ _id: new ObjectId(u.id) }))[0];

before(async () => {
    if (skip) return;
    mongo = await new MongoClient(buildUri(), { appName: "w4-live-readonly" }).connect();
    a = await signUp("a");
    b = await signUp("b");
});
after(async () => { await mongo?.close(); });

const INTERNAL = ["__v", "userId", "pushToken", "googleId", "totpEnabled", "authProvider", "deactivatedAt", "password"];

test("sign-in: a wrong password is 401 invalid_credentials whatever its length; an unknown email too", { skip }, async () => {
    const msg = "That email and password don't match";
    failed(await call("POST", "/auth/login", { email: a.email, password: "short" }), 401, "invalid_credentials", msg);
    failed(await call("POST", "/auth/login", { email: a.email, password: "wrong-but-long" }), 401, "invalid_credentials", msg);
    failed(await call("POST", "/auth/login", { email: `nobody-${Date.now()}@example.test`, password: "whatever1" }), 401, "invalid_credentials", msg);
});

test("sign-up: duplicate email 409; the user reply has no internal fields", { skip }, async () => {
    failed(await call("POST", "/auth/register", { name: "W4", email: a.email, password: PASSWORD }), 409, "duplicate", "An account with this email already exists. Sign in instead");
    const me = await as(a)("GET", "/auth/me");
    assert.equal(me.status, 200);
    for (const f of INTERNAL) assert.ok(!(f in me.json.data), `/auth/me still sends ${f}`);
});

test("change-password: a wrong current password is 400 wrong_password, not 401", { skip }, async () => {
    failed(await as(a)("POST", "/auth/change-password", { currentPassword: "not-it-at-all", newPassword: "another-one-1" }), 400, "wrong_password", "Your current password isn't right");
});

test("protect: no token, a bad token and a token whose user is gone are 401 unauthenticated", { skip }, async () => {
    failed(await call("GET", "/accounts"), 401, "unauthenticated", "Please sign in again");
    failed(await call("GET", "/accounts", undefined, "not-a-jwt"), 401, "unauthenticated", "Your session has ended. Please sign in again");
    const ghost = jwt.sign({ userId: new ObjectId().toHexString(), name: "x", email: "x@example.test", loginTime: new Date().toISOString() }, process.env.JWT_SECRET!, { expiresIn: 60 });
    failed(await call("GET", "/accounts", undefined, ghost), 401, "unauthenticated", "Please sign in again");
    failed(await call("GET", "/auth/me", undefined, ghost), 401, "unauthenticated");
});

test("users: parallel switches all land (T14); a missing default account is 400 invalid_reference", { skip }, async () => {
    const r = await Promise.all([{ budgetAlerts: false }, { goalMilestones: false }, { weeklySummary: true }].map((n) => as(a)("PATCH", "/users/me", { prefs: { notifications: n } })));
    assert.deepEqual(r.map((x) => x.status), [200, 200, 200]);
    const n = (await storedUser(a)).prefs.notifications;
    assert.deepEqual([n.budgetAlerts, n.goalMilestones, n.weeklySummary], [false, false, true]);
    failed(await as(a)("PATCH", "/users/me", { prefs: { defaultAccount: new ObjectId().toHexString() } }), 400, "invalid_reference", "The default account isn't one of your accounts any more. Pick another");
    const ok = await as(a)("PATCH", "/users/me", { name: "W4 Renamed" });
    assert.equal(ok.json.data.name, "W4 Renamed");
    for (const f of INTERNAL) assert.ok(!(f in ok.json.data), `PATCH /users/me still sends ${f}`);
});

test("users: registering a push token takes it off every other user (N18)", { skip }, async () => {
    const token = `ExponentPushToken[w4-${randomBytes(4).toString("hex")}]`;
    assert.equal((await as(a)("PATCH", "/users/me", { pushToken: token })).status, 200);
    assert.equal((await storedUser(a)).pushToken, token);
    assert.equal((await as(b)("PATCH", "/users/me", { pushToken: token })).status, 200);
    assert.equal((await storedUser(b)).pushToken, token);
    assert.equal((await storedUser(a)).pushToken, undefined, "the earlier user still has the phone's token");
    assert.equal((await as(b)("PATCH", "/users/me", { pushToken: null })).status, 200);
    assert.equal((await storedUser(b)).pushToken, undefined);
});

test("categories: duplicates 409 (case-insensitive, one live name per user as before R1), references 400, archive in one go", { skip }, async () => {
    const send = as(a);
    const top = await send("POST", "/categories", { name: "W4 Hobbies", kind: "expense", icon: "star", color: "blue" });
    assert.equal(top.status, 201);
    for (const f of INTERNAL) assert.ok(!(f in top.json.data), `category reply still sends ${f}`);
    const parent = top.json.data._id as string;
    failed(await send("POST", "/categories", { name: "w4 hobbies", kind: "expense", icon: "star", color: "blue" }), 409, "duplicate", "You already have a category with that name");
    // Same name, other kind: still refused, as before R1 (rows show the bare name).
    failed(await send("POST", "/categories", { name: "W4 Hobbies", kind: "income" }), 409, "duplicate");
    const child = await send("POST", "/categories", { name: "W4 Paints", kind: "expense", parent });
    assert.equal(child.status, 201);
    failed(await send("POST", "/categories", { name: "W4 Paints", kind: "expense", parent }), 409, "duplicate");
    failed(await send("POST", "/categories", { name: "W4 Other", kind: "expense", parent: new ObjectId().toHexString() }), 400, "invalid_reference", "Parent category isn't one of your categories any more. Pick another");
    failed(await send("POST", "/categories", { name: "W4 Other", kind: "income", parent }), 400, "invalid_input", "A sub-category has to be the same kind as its parent");
    failed(await send("POST", "/categories", { name: "W4 Deep", kind: "expense", parent: child.json.data._id }), 400, "invalid_input", "Categories can only be 2 levels deep");
    const second = await send("POST", "/categories", { name: "W4 Second", kind: "expense" });
    failed(await send("PATCH", `/categories/${second.json.data._id}`, { name: "W4 HOBBIES" }), 409, "duplicate");
    failed(await send("GET", "/categories/abc"), 404, "not_found", "That category doesn't exist any more");
    failed(await send("PATCH", "/categories/reorder", { ids: [parent, new ObjectId().toHexString()] }), 400, "invalid_reference");

    const archived = await send("DELETE", `/categories/${parent}`);
    assert.equal(archived.status, 200);
    assert.equal(archived.json.message, "Category archived");
    assert.deepEqual(archived.json.data, { archivedChildren: 1 });
    failed(await send("DELETE", `/categories/${parent}`), 404, "not_found");
    const live = await ro.col("categories").count({ parent: new ObjectId(parent), isArchived: false });
    assert.equal(live, 0);
});

test("backup: today's file restores, so does one from before trips; a foreign reference is refused without its id", { skip }, async () => {
    const send = as(a);
    const backup = (await send("GET", "/backup")).json.data;
    const restored = await send("POST", "/backup/restore", { ...backup, confirm: true });
    assert.equal(restored.status, 200, JSON.stringify(restored.json));
    assert.equal(restored.json.data.counts.categories, backup.categories.length);
    for (const f of INTERNAL) assert.ok(!(f in restored.json.data.user), `restore's user still sends ${f}`);

    const { trips: _t, tripExpenses: _e, ...older } = backup;
    assert.equal((await send("POST", "/backup/restore", { ...older, confirm: true })).status, 200);

    const bCategory = ((await as(b)("GET", "/categories")).json.data as { _id: string }[])[0]._id;
    const foreign = { ...backup, budgets: [{ _id: new ObjectId().toHexString(), category: bCategory, month: "2026-11", limit: 100 }], confirm: true };
    const r = await send("POST", "/backup/restore", foreign);
    failed(r, 400, "invalid_reference", "This backup refers to data that isn't yours");
    assert.ok(!JSON.stringify(r.json.message).includes(bCategory));
    assert.deepEqual(r.json.issues.map((i: { path: string }) => i.path), ["budgets.category"]);
    failed(await send("POST", "/backup/restore", { confirm: true }), 400, "invalid_input", "That doesn't look like a Save n Spend backup file");
    failed(await call("POST", "/backup/restore", { ...backup, confirm: true }), 401, "unauthenticated");
});

test("diagnostics: a report is taken without a token; the log the phone reads has no stack lines", { skip }, async () => {
    const report = await call("POST", "/diagnostics/client-errors", { message: "w4 probe", stack: "Error: w4\n  at probe", screen: "/w4", appVersion: "2.6.0" });
    assert.equal(report.status, 200);
    await as(a)("GET", "/categories/abc"); // a failed request of its own
    const rows = (await as(a)("GET", "/diagnostics/requests")).json.data as Record<string, unknown>[];
    assert.ok(rows.length > 0);
    for (const row of rows) assert.ok(!("stack" in row), "a row still carries stack");
});

test("dashboard, insights, reviews and highlights: same answers, bad input is 4xx", { skip }, async () => {
    const send = as(a);
    assert.equal((await send("GET", "/dashboard/summary")).status, 200);
    failed(await send("GET", "/dashboard/summary?month=2026-13"), 400, "invalid_input");
    assert.equal((await send("GET", "/insights?period=month&offset=0&utm=x")).status, 200);
    failed(await send("GET", "/insights?offset=1"), 400, "invalid_input", "You can't look at a future period");
    failed(await send("GET", "/insights/category/abc?period=month&offset=0"), 404, "not_found");
    failed(await send("GET", `/insights/category/${new ObjectId().toHexString()}`), 404, "not_found", "That category doesn't exist any more");
    failed(await send("GET", "/reviews?offset=0"), 400, "invalid_input", "That period hasn't finished yet");
    assert.equal((await send("GET", "/reviews?period=week&offset=-1")).status, 200);
    await send("GET", "/highlights");
    const history = await send("GET", "/highlights/history?page=1&limit=20");
    assert.equal(history.status, 200);
    for (const k of ["docs", "page", "hasNextPage", "totalDocs"]) assert.ok(k in history.json.data, `history lost ${k}`);
    for (const d of history.json.data.docs) for (const f of ["__v", "userId"]) assert.ok(!(f in d), `history row still sends ${f}`);
});

// Last: closes user A.
test("a closed account is 401 on every route, not only /auth/me; signing in reopens it", { skip }, async () => {
    const oldToken = a.token;
    const send = (method: string, p: string, body?: unknown) => call(method, p, body, oldToken);
    assert.equal((await send("DELETE", "/users/me")).status, 200);
    const closed = "This account was closed. Sign in to reopen it";
    for (const [method, p] of [["GET", "/auth/me"], ["GET", "/accounts"], ["GET", "/categories"], ["GET", "/dashboard/summary"], ["GET", "/transactions"]] as const) {
        failed(await send(method, p), 401, "unauthenticated", closed);
    }
    failed(await send("PATCH", "/users/me", { pushToken: null }), 401, "unauthenticated", closed);
    const back = await call("POST", "/auth/login", { email: a.email, password: a.password });
    assert.equal(back.status, 200);
    a.token = back.json.data.accessToken;
    assert.equal((await as(a)("GET", "/accounts")).status, 200);
    // The token from before the close works again too: the account is open.
    assert.equal((await send("GET", "/accounts")).status, 200);
});
