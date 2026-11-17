import { test, after, mock } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import "express-async-errors";
import express from "express";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import Transaction from "../models/Transaction";
import User from "../models/User";
import { AppError } from "../utils/AppError";
import { MESSAGES, styleProblems } from "../utils/messages";
import { z as v3 } from "zod";
import * as v4 from "zod/v4";
import { objectId } from "../schemas/fields";
import { z } from "../schemas/z";
import { errorHandler, routeNotFound, thingInPath, toFailure } from "./errorHandler";
import { requireJsonBody } from "./requireJsonBody";
import { rateLimitHandler } from "./rateLimiter";

// Stand-ins shaped like 207518b's schemas (v4 transactions, v3 accounts), so this test doesn't
// depend on files the area workers are rewriting.
const createTransactionSchema = v4.discriminatedUnion("type", [
    v4.object({ type: v4.literal("expense"), amount: v4.number().int().positive(), account: v4.string(), category: v4.string(), title: v4.string().min(1) }).strict(),
    v4.object({ type: v4.literal("income"), amount: v4.number().int().positive(), account: v4.string(), category: v4.string(), title: v4.string().min(1) }).strict(),
]);
const createAccountSchema = v3.object({ name: v3.string().min(1).trim(), type: v3.enum(["bank", "cash"]), startingBalance: v3.number().int() }).strict();

const req = (originalUrl: string, body?: unknown, query?: unknown) => ({ originalUrl, body, query });
const thrown = (fn: () => unknown): unknown => { try { fn(); } catch (e) { return e; } throw new Error("did not throw"); };

test("zod v4 errors (the 9 handlers that answered 500) are 400 invalid_input with issues", () => {
    const f = toFailure(thrown(() => createTransactionSchema.parse({ type: "expense", amount: -1, account: "a", category: "c", title: "t" })), req("/api/v1/transactions"));
    assert.equal(f.status, 400);
    assert.equal(f.code, "invalid_input");
    assert.equal(f.message, "Amount must be more than zero");
    assert.deepEqual(f.issues, [{ path: "amount", message: "Amount must be more than zero" }]);
});

test("zod v3 errors are 400 invalid_input, every issue listed", () => {
    const f = toFailure(thrown(() => createAccountSchema.parse({})), req("/api/v1/accounts"));
    assert.equal(f.status, 400);
    assert.equal(f.code, "invalid_input");
    assert.deepEqual(f.issues?.map((i) => i.path), ["name", "type", "startingBalance"]);
});

test("a malformed body id from objectId() is invalid_reference", () => {
    const schema = z.object({ toAccount: objectId("The account it goes to", "accounts") });
    const f = toFailure(thrown(() => schema.parse({ toAccount: "nope" })), req("/api/v1/transactions"));
    assert.equal(f.code, "invalid_reference");
    assert.equal(f.message, "The account it goes to isn't one of your accounts any more. Pick another");
});

test("Mongoose CastError: an id in the URL is 404, one in the body is 400 invalid_reference", () => {
    const cast = new mongoose.Error.CastError("ObjectId", "abc", "_id");
    const path = toFailure(cast, req("/api/v1/bills/abc/pay"));
    assert.deepEqual([path.status, path.code, path.message], [404, "not_found", "That bill doesn't exist any more"]);

    const body = toFailure(cast, req("/api/v1/users/me", { prefs: { defaultAccount: "abc" } }));
    assert.deepEqual([body.status, body.code], [400, "invalid_reference"]);
    assert.equal(body.message, "The default account isn't one of your accounts any more. Pick another");
    assert.deepEqual(body.issues, [{ path: "prefs.defaultAccount", message: body.message }]);

    const query = toFailure(new mongoose.Error.CastError("ObjectId", "zz", "category"), req("/api/v1/transactions?category=zz", {}, { category: "zz" }));
    assert.equal(query.message, "Category isn't one of your categories any more. Pick another");

    const date = toFailure(new mongoose.Error.CastError("date", "Invalid Date", "occurredAt"), req("/api/v1/transactions", { occurredAt: "soon" }));
    assert.deepEqual([date.status, date.code, date.message], [400, "invalid_input", "Date isn't a valid date"]);
});

test("Mongoose ValidationError lists each path in plain words", () => {
    const err = new Transaction({ type: "gift", amount: -1, category: "zzz" }).validateSync();
    const f = toFailure(err, req("/api/v1/transactions", { category: "zzz" }));
    assert.equal(f.status, 400);
    const byPath = Object.fromEntries((f.issues ?? []).map((i) => [i.path, i.message]));
    assert.equal(byPath.type, "Type isn't one of the options");
    assert.equal(byPath.amount, "Amount can't be negative");
    assert.equal(byPath.account, "Account is required");
    assert.equal(byPath.category, "Category isn't one of your categories any more. Pick another");
    for (const m of Object.values(byPath)) assert.deepEqual(styleProblems(m), [], m);

    const zone = toFailure(new User({ name: "A", email: "a@example.test", prefs: { timeZone: "Mars/Base" } }).validateSync(), req("/api/v1/users/me"));
    assert.ok(zone.issues?.some((i) => i.message === "That time zone isn't recognised"));
});

test("a duplicate key stays 409, now with code duplicate", () => {
    const f = toFailure(Object.assign(new Error("E11000 duplicate key error collection: x"), { code: 11000 }), req("/api/v1/transactions"));
    assert.deepEqual([f.status, f.code, f.message], [409, "duplicate", MESSAGES.duplicateGeneric]);
    // S3: the log gets the friendly sentence; Mongo's text is for the debug line only.
    assert.deepEqual([f.logMessage, f.debugMessage], [undefined, "E11000 duplicate key error collection: x"]);
});

test("AppError keeps its status; the code comes from it unless given", () => {
    assert.equal(toFailure(AppError.badRequest("Pick two different accounts"), req("/api/v1/transactions")).code, "invalid_input");
    assert.equal(toFailure(AppError.notFound("Bill not found"), req("/api/v1/bills/x")).code, "not_found");
    assert.equal(toFailure(AppError.conflict("Email is already in use"), req("/api/v1/auth/register")).code, "conflict");
    assert.equal(toFailure(AppError.unauthorized("Invalid credentials!"), req("/api/v1/auth/login")).code, "invalid_credentials");
    assert.equal(toFailure(AppError.unauthorized("Current password is incorrect"), req("/api/v1/auth/change-password")).code, "invalid_credentials");
    assert.equal(toFailure(AppError.unauthorized("Token is missing"), req("/api/v1/accounts")).code, "unauthenticated");
    assert.equal(toFailure(AppError.unauthorized("Account is deactivated"), req("/api/v1/auth/me")).code, "unauthenticated");
    const ref = toFailure(AppError.invalidReference("category", "Category", "categories"), req("/api/v1/bills"));
    assert.deepEqual([ref.status, ref.code, ref.issues?.[0].path], [400, "invalid_reference", "category"]);
    assert.equal(toFailure(AppError.duplicate("a budget for this category this month"), req("/api/v1/budgets")).code, "duplicate");
});

test("anything else is 500 internal, with the real message kept for the log only", () => {
    const f = toFailure(new TypeError("cannot read x of undefined"), req("/api/v1/accounts"));
    assert.deepEqual([f.status, f.code, f.message], [500, "internal", MESSAGES.internal]);
    assert.equal(f.logMessage, "cannot read x of undefined");
    assert.ok(f.stack);
    assert.equal(toFailure("a string", req("/x")).status, 500);
});

test("thingInPath names the resource before the id", () => {
    assert.equal(thingInPath("/api/v1/trips/abc/expenses/def", "def"), "expense");
    assert.equal(thingInPath("/api/v1/trips/abc/expenses/def", "abc"), "trip");
    assert.equal(thingInPath("/api/v1/insights/category/abc?period=month", "abc"), "category");
    assert.equal(thingInPath("/api/v1/investments/abc/history", "abc"), "holding");
    assert.equal(thingInPath("/api/v1/nowhere/abc", "abc"), "item");
});

// ---- Over HTTP: body-parser, content type, 404 route, 401 header, 429 -----------------------

const app = express();
app.use((_req, res, next) => { res.locals.requestId = "TEST42"; next(); });
// What the request logger would write as the line's message.
let logged: unknown;
app.use((_req, res, next) => { res.on("finish", () => { logged = res.locals.errorMessage; }); next(); });
const RAW_DUPLICATE = "E11000 duplicate key error collection: save-n-spend-dev.accounts index: _id_ dup key: { _id: ObjectId('6a764ebda1e3aa857dbec531') }";
app.post("/restore", () => { throw Object.assign(new Error(RAW_DUPLICATE), { code: 11000 }); });
app.use(express.json({ limit: "1kb" }));
app.use(requireJsonBody);
app.post("/echo", (r, res) => { res.json({ success: true, data: r.body ?? null }); });
app.post("/v4", (r, res) => { createTransactionSchema.parse(r.body); res.json({ success: true }); });
app.get("/private", () => { throw AppError.unauthorized("Token is missing"); });
app.get("/limited", rateLimit({ windowMs: 60_000, max: 1, standardHeaders: true, legacyHeaders: false, handler: rateLimitHandler(MESSAGES.rateLimitedAuth) }), (_r, res) => { res.json({ success: true }); });
app.use(routeNotFound);
app.use(errorHandler);
const server = app.listen(0, "127.0.0.1");
after(() => server.close());
const url = (p: string) => `http://127.0.0.1:${(server.address() as AddressInfo).port}${p}`;
const call = async (p: string, init: RequestInit = {}) => {
    const res = await fetch(url(p), init);
    return { res, body: await res.json() as Record<string, unknown> };
};
const json = { "Content-Type": "application/json" };

test("broken JSON is 400 invalid_json in the standard shape", async () => {
    const { res, body } = await call("/echo", { method: "POST", headers: json, body: "{nope" });
    assert.equal(res.status, 400);
    assert.deepEqual(body, { success: false, statusCode: 400, code: "invalid_json", message: MESSAGES.invalidJson, data: null, requestId: "TEST42" });
});

test("a body over the limit is 413 body_too_large", async () => {
    const { res, body } = await call("/echo", { method: "POST", headers: json, body: JSON.stringify({ csv: "x".repeat(2_000) }) });
    assert.deepEqual([res.status, body.code], [413, "body_too_large"]);
});

test("a body sent without a JSON content type is 400 invalid_json; a body-less POST is untouched", async () => {
    const none = await call("/echo", { method: "POST", body: JSON.stringify({ a: 1 }), headers: { "Content-Type": "" } });
    assert.deepEqual([none.res.status, none.body.code], [400, "invalid_json"]);
    const text = await call("/echo", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
    assert.deepEqual([text.res.status, text.body.code], [400, "invalid_json"]);
    const empty = await call("/echo", { method: "POST", headers: json });
    assert.equal(empty.res.status, 200);
    const bare = await call("/echo", { method: "POST" });
    assert.equal(bare.res.status, 200);
});

test("a v4 schema failure over HTTP is 400, not 500", async () => {
    const { res, body } = await call("/v4", { method: "POST", headers: json, body: JSON.stringify({ type: "expense" }) });
    assert.equal(res.status, 400);
    assert.equal(body.code, "invalid_input");
    assert.ok(Array.isArray(body.issues));
});

test("401 carries WWW-Authenticate; unknown routes are route_not_found", async () => {
    const auth = await call("/private");
    assert.equal(auth.res.status, 401);
    assert.match(auth.res.headers.get("www-authenticate") ?? "", /^Bearer /);
    assert.equal(auth.body.code, "unauthenticated");
    const missing = await call("/nope", { method: "PUT" });
    assert.deepEqual([missing.res.status, missing.body.code, missing.body.message, missing.body.requestId], [404, "route_not_found", MESSAGES.routeNotFound, "TEST42"]);
});

test("a duplicate restore logs the friendly sentence; Mongo's text only at LOG_LEVEL=debug", async () => {
    const lines = mock.method(console, "log", () => undefined);
    const before = process.env.LOG_LEVEL;
    try {
        delete process.env.LOG_LEVEL;
        const quiet = await call("/restore", { method: "POST" });
        await new Promise((r) => setImmediate(r));
        assert.deepEqual([quiet.res.status, quiet.body.code, quiet.body.message], [409, "duplicate", MESSAGES.duplicateGeneric]);
        assert.equal(logged, MESSAGES.duplicateGeneric);
        assert.equal(lines.mock.callCount(), 0, "no debug line at the default level");

        process.env.LOG_LEVEL = "debug";
        await call("/restore", { method: "POST" });
        await new Promise((r) => setImmediate(r));
        assert.equal(logged, MESSAGES.duplicateGeneric);
        assert.equal(lines.mock.callCount(), 1);
        const line = JSON.parse(String(lines.mock.calls[0].arguments[0]));
        assert.deepEqual([line.level, line.requestId, line.message], ["debug", "TEST42", RAW_DUPLICATE]);
    }
    finally {
        lines.mock.restore();
        if (before === undefined) delete process.env.LOG_LEVEL; else process.env.LOG_LEVEL = before;
    }
});

test("429 has requestId, code rate_limited and Retry-After", async () => {
    await call("/limited");
    const { res, body } = await call("/limited");
    assert.equal(res.status, 429);
    assert.deepEqual([body.code, body.message, body.requestId], ["rate_limited", MESSAGES.rateLimitedAuth, "TEST42"]);
    assert.ok(Number(res.headers.get("retry-after")) > 0);
});
