import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import "express-async-errors";
import express from "express";
import mongoose from "mongoose";
import IdempotencyRecord from "../models/IdempotencyRecord";
import { inTransaction } from "../utils/inTransaction";
import { MESSAGES, styleProblems } from "../utils/messages";
import { errorHandler } from "./errorHandler";
import { LEASE_MS, LOST_REPLY, decide, isValidKey, outcomeFor, requestHash, withIdempotency } from "./idempotency";

// No database: the record collection and MongoDB transactions are stood in for in memory, with
// the two properties the design rests on: one row per (user, key), and a write made inside a
// transaction (the commit marker) disappearing when the transaction throws.

test("keys: 1 to 255 letters, digits, _ and -", () => {
    for (const ok of ["a", "01jcz8k2m4n6p8q0r2s4t6v8wx", "6f1c9a52-6a0e-4f0e-9d0b-3c2b1a0f9e8d", "a".repeat(255), "key_1-2"]) assert.ok(isValidKey(ok), ok);
    for (const bad of ["", "a".repeat(256), "has space", "semi;colon", "ünïcode", "slash/key", "dot.key", "colon:key"]) assert.ok(!isValidKey(bad), bad);
});

test("the request hash ignores key order and sees params, query and body", () => {
    const a = requestHash({ params: { id: "1" }, query: {}, body: { amount: 5, account: "x", owedBy: [{ a: 1, b: 2 }] } });
    assert.equal(a, requestHash({ params: { id: "1" }, query: {}, body: { owedBy: [{ b: 2, a: 1 }], account: "x", amount: 5 } }));
    assert.notEqual(a, requestHash({ params: { id: "2" }, query: {}, body: { amount: 5, account: "x", owedBy: [{ a: 1, b: 2 }] } }));
    assert.notEqual(a, requestHash({ params: { id: "1" }, query: { mode: "keep" }, body: { amount: 5, account: "x", owedBy: [{ a: 1, b: 2 }] } }));
    assert.notEqual(a, requestHash({ params: { id: "1" }, query: {}, body: { amount: 6, account: "x", owedBy: [{ a: 1, b: 2 }] } }));
});

test("decide: mismatch, replay, busy, lost, takeover", () => {
    const now = new Date("2026-11-15T10:00:00Z");
    const later = new Date(now.getTime() + 1000), earlier = new Date(now.getTime() - 1000);
    const seen = (over: object) => ({ route: "POST /a", bodyHash: "h", status: "in_progress" as const, committed: false, lockedUntil: later, ...over });
    assert.equal(decide(seen({}), "POST /b", "h", now), "mismatch");
    assert.equal(decide(seen({ status: "done" }), "POST /a", "other", now), "mismatch");
    assert.equal(decide(seen({ status: "done" }), "POST /a", "h", now), "replay");
    assert.equal(decide(seen({}), "POST /a", "h", now), "busy");
    assert.equal(decide(seen({ committed: true }), "POST /a", "h", now), "busy");
    assert.equal(decide(seen({ committed: true, lockedUntil: earlier }), "POST /a", "h", now), "lost");
    assert.equal(decide(seen({ lockedUntil: earlier }), "POST /a", "h", now), "takeover");
});

test("outcomeFor: only 2xx is stored; anything else releases a key that wrote nothing", () => {
    for (const s of [200, 201]) assert.equal(outcomeFor(s, false), "store", String(s));
    for (const s of [400, 404, 409, 413, 422, 429, 500, 502]) assert.equal(outcomeFor(s, false), "release", String(s));
    for (const s of [200, 201]) assert.equal(outcomeFor(s, true), "store", String(s));
    for (const s of [400, 409, 500]) assert.equal(outcomeFor(s, true), "lost", String(s));
});

test("the messages follow the rules", () => {
    for (const m of [MESSAGES.idempotencyInProgress, MESSAGES.idempotencyMismatch, MESSAGES.alreadySaved]) assert.deepEqual(styleProblems(m), [], m);
    assert.equal(JSON.parse(LOST_REPLY).success, true);
});

// ---- The middleware over HTTP, with the stand-ins --------------------------------------------

type Row = Record<string, unknown> & { _id: string; userId: unknown; key: string };
let rows: Row[] = [];
let nextId = 1;
const same = (a: unknown, b: unknown) => String(a) === String(b);
const matches = (row: Row, filter: Record<string, unknown>) => Object.entries(filter).every(([k, v]) => same(row[k], v));
const find = (filter: Record<string, unknown>) => rows.find((r) => matches(r, filter)) ?? null;
const apply = (row: Row, update: { $set?: Record<string, unknown> }) => Object.assign(row, update.$set ?? {});
const copy = <T>(v: T): T => (v ? { ...v } : v);

const M = IdempotencyRecord as unknown as Record<string, unknown>;
const saved = { ...Object.fromEntries(["findOne", "create", "updateOne", "deleteOne", "findOneAndUpdate"].map((k) => [k, M[k]])) };
M.findOne = (f: Record<string, unknown>) => ({ lean: async () => copy(find(f)) });
M.create = async (doc: Row) => {
    if (rows.some((r) => same(r.userId, doc.userId) && r.key === doc.key)) throw Object.assign(new Error("E11000"), { code: 11000 });
    const row = { committed: false, statusCode: null, body: null, ...doc, _id: String(nextId++) };
    rows.push(row);
    return copy(row);
};
M.updateOne = async (f: Record<string, unknown>, u: { $set?: Record<string, unknown> }) => {
    const row = find(f);
    if (row) apply(row, u);
    return { matchedCount: row ? 1 : 0 };
};
M.deleteOne = async (f: Record<string, unknown>) => {
    const before = rows.length;
    rows = rows.filter((r) => !matches(r, f));
    return { deletedCount: before - rows.length };
};
M.findOneAndUpdate = (f: Record<string, unknown>, u: { $set?: Record<string, unknown> }) => ({ lean: async () => { const row = find(f); if (row) apply(row, u); return copy(row); } });

const conn = mongoose.connection as unknown as { transaction: unknown };
const realTransaction = conn.transaction;
conn.transaction = async (fn: (s: unknown) => Promise<unknown>) => {
    const snapshot = { rows: rows.map((r) => ({ ...r })), ledger: [...ledger] };
    try { return await fn({ id: "fake-session" }); }
    catch (e) { rows = snapshot.rows; ledger = snapshot.ledger; throw e; }
};

after(() => {
    Object.assign(M, saved);
    conn.transaction = realTransaction;
    server.close();
});

/** The "database" the route writes to; a write lands only if its transaction commits. */
let ledger: string[] = [];
let gate: Promise<void> | null = null;
let failAfterCommit = false;

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { userId: "6a76e9a4ddbd6be2f295518d", name: "T", email: "t@example.test", loginTime: "" }; next(); });
app.post("/api/v1/things/:id", withIdempotency({ money: true }), async (req, res) => {
    if (gate) await gate;
    if (req.body.status) { res.status(req.body.status).json({ success: false, statusCode: req.body.status, message: "No", data: null }); return; }
    const n = await inTransaction(async () => { ledger = [...ledger, String(req.body.title)]; return ledger.length; });
    if (failAfterCommit) throw new Error("after the commit");
    res.status(201).json({ success: true, statusCode: 201, message: "Thing created", data: { n, at: Math.random() } });
});
app.use(errorHandler);
const server = app.listen(0, "127.0.0.1");
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/things/1`;
const post = async (body: unknown, key?: string) => {
    const res = await fetch(base(), { method: "POST", headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: JSON.stringify(body) });
    return { status: res.status, text: await res.text(), replayed: res.headers.get("idempotent-replayed"), retryAfter: res.headers.get("retry-after") };
};

beforeEach(() => { rows = []; ledger = []; gate = null; failAfterCommit = false; });

test("no key: runs every time, as before, and stores nothing", async () => {
    const warn = console.log;
    const lines: string[] = [];
    console.log = (line: string) => { lines.push(line); };
    try {
        assert.equal((await post({ title: "a" })).status, 201);
        assert.equal((await post({ title: "a" })).status, 201);
    }
    finally { console.log = warn; }
    assert.deepEqual(ledger, ["a", "a"]);
    assert.equal(rows.length, 0);
    assert.equal(lines.filter((l) => l.includes("without an Idempotency-Key")).length, 2);
});

test("same key twice: one write, and the second gets the first reply byte for byte", async () => {
    const a = await post({ title: "a" }, "key-00000001");
    const b = await post({ title: "a" }, "key-00000001");
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.equal(b.text, a.text);
    assert.equal(b.replayed, "true");
    assert.equal(a.replayed, null);
    assert.deepEqual(ledger, ["a"]);
    assert.equal(rows[0].status, "done");
    assert.equal(rows[0].committed, true);
});

test("same key, different body: 422 idempotency_mismatch, nothing written", async () => {
    await post({ title: "a" }, "key-00000002");
    const b = await post({ title: "b" }, "key-00000002");
    assert.equal(b.status, 422);
    assert.equal(JSON.parse(b.text).code, "idempotency_mismatch");
    assert.deepEqual(ledger, ["a"]);
});

test("same key while the first runs: 409 idempotency_in_progress with Retry-After, then one write", async () => {
    let open!: () => void;
    gate = new Promise((r) => { open = r; });
    const first = post({ title: "a" }, "key-00000003");
    await new Promise((r) => setTimeout(r, 30));
    const second = await post({ title: "a" }, "key-00000003");
    assert.equal(second.status, 409);
    assert.equal(JSON.parse(second.text).code, "idempotency_in_progress");
    assert.ok(Number(second.retryAfter) >= 1);
    open();
    assert.equal((await first).status, 201);
    assert.deepEqual(ledger, ["a"]);
});

test("a malformed key is 400 invalid_input, nothing written", async () => {
    const r = await post({ title: "a" }, "bad key");
    assert.equal(r.status, 400);
    assert.equal(JSON.parse(r.text).code, "invalid_input");
    assert.deepEqual(ledger, []);
});

test("any non-2xx that wrote nothing releases the key, so the same key can run again", async () => {
    assert.equal((await post({ status: 404 }, "key-00000004")).status, 404);
    assert.equal(rows.some((r) => r.key === "key-00000004"), false);
    assert.equal((await post({ title: "a" }, "key-00000004")).status, 201, "same key, now a valid body");
    assert.deepEqual(ledger, ["a"]);
    await post({ status: 409 }, "key-00000005");
    assert.equal(rows.some((r) => r.key === "key-00000005"), false);
    await post({ status: 503 }, "key-00000006");
    assert.equal(rows.some((r) => r.key === "key-00000006"), false);
});

test("a 5xx after the write committed is never run again: retries get 200 already saved", async () => {
    failAfterCommit = true;
    assert.equal((await post({ title: "a" }, "key-00000007")).status, 500);
    failAfterCommit = false;
    const again = await post({ title: "a" }, "key-00000007");
    assert.equal(again.status, 200);
    assert.equal(again.text, LOST_REPLY);
    assert.deepEqual(ledger, ["a"]);
});

test("crash between the commit and storing the reply: no second write, ever", async () => {
    // The state a crash leaves: the marker committed with the write, no reply stored.
    const userId = "6a76e9a4ddbd6be2f295518d";
    const hash = requestHash({ params: { id: "1" }, query: {}, body: { title: "a" } });
    ledger = ["a"];
    rows = [{ _id: "99", userId, key: "key-00000008", route: "POST /api/v1/things/:id", bodyHash: hash, status: "in_progress", committed: true, attempt: "dead", lockedUntil: new Date(Date.now() + LEASE_MS), statusCode: null, body: null }];
    const soon = await post({ title: "a" }, "key-00000008");
    assert.equal(soon.status, 409, "inside the lease it may still be finishing");
    rows[0].lockedUntil = new Date(Date.now() - 1);
    const later = await post({ title: "a" }, "key-00000008");
    assert.equal(later.status, 200);
    assert.equal(later.text, LOST_REPLY);
    assert.equal((await post({ title: "a" }, "key-00000008")).text, LOST_REPLY);
    assert.deepEqual(ledger, ["a"]);
});

test("crash before the commit: after the lease a retry takes the claim over and writes once", async () => {
    const userId = "6a76e9a4ddbd6be2f295518d";
    const hash = requestHash({ params: { id: "1" }, query: {}, body: { title: "a" } });
    rows = [{ _id: "98", userId, key: "key-00000009", route: "POST /api/v1/things/:id", bodyHash: hash, status: "in_progress", committed: false, attempt: "dead", lockedUntil: new Date(Date.now() - 1), statusCode: null, body: null }];
    assert.equal((await post({ title: "a" }, "key-00000009")).status, 201);
    assert.deepEqual(ledger, ["a"]);
});

test("a first attempt that outlives its lease can't commit after a retry took over", async () => {
    let open!: () => void;
    gate = new Promise((r) => { open = r; });
    const slow = post({ title: "a" }, "key-00000010");
    await new Promise((r) => setTimeout(r, 30));
    rows[0].lockedUntil = new Date(Date.now() - 1);
    const gateHeld = gate;
    gate = null;
    const retry = await post({ title: "a" }, "key-00000010");
    assert.equal(retry.status, 201);
    gate = gateHeld;
    open();
    const first = await slow;
    assert.equal(first.status, 409);
    assert.equal(JSON.parse(first.text).code, "idempotency_in_progress");
    assert.deepEqual(ledger, ["a"], "the slow attempt's write was rolled back with its marker");
    assert.equal((await post({ title: "a" }, "key-00000010")).text, retry.text);
});
