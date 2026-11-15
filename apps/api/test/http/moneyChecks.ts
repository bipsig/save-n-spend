import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import type { Reply, Send, TestApi } from "../harness";
import { styleProblems } from "../../src/utils/messages";

// Checks shared by accounts.test.ts, transactions.test.ts and investments.test.ts.

export const MISSING = "65a1b2c3d4e5f60718293a4b";
export const MALFORMED = "not-an-id";

export const par = <T>(n: number, fn: (i: number) => Promise<T>) => Promise.all(Array.from({ length: n }, (_, i) => fn(i)));
export const statuses = (rs: Reply[]) => rs.map((r) => r.status).sort();
export const keyed = (key: string) => ({ headers: { "Idempotency-Key": key } });
export const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/** The one error shape: `{ success: false, statusCode, code, message, issues?, data: null, requestId }`. */
export const failed = (r: Reply, status: number, code: string, opts: { message?: string; path?: string } = {}) => {
    assert.equal(r.status, status, `${r.status} ${r.text.slice(0, 400)}`);
    const j = r.json;
    assert.equal(j.success, false);
    assert.equal(j.statusCode, status);
    assert.equal(j.code, code);
    assert.equal(j.data, null);
    assert.equal(typeof j.message, "string");
    assert.deepEqual(styleProblems(j.message), [], j.message);
    assert.ok(typeof j.requestId === "string" && j.requestId.length > 0, "requestId");
    assert.equal(j.requestId, r.headers.get("x-request-id"));
    if (code === "invalid_input" || code === "invalid_reference") {
        for (const i of j.issues ?? []) assert.deepEqual([typeof i.path, typeof i.message], ["string", "string"]);
    }
    else assert.equal(j.issues, undefined, "issues only on invalid_input / invalid_reference");
    if (code === "invalid_reference") assert.ok(j.issues?.length, "invalid_reference names its field");
    if (opts.message !== undefined) assert.equal(j.message, opts.message);
    if (opts.path !== undefined) assert.equal(j.issues?.[0]?.path, opts.path, JSON.stringify(j.issues));
};

/** No token, a malformed one, and one signed with another secret: 401 unauthenticated each time. */
export const signedOut = async (api: TestApi, method: string, path: string, body?: unknown) => {
    const forged = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiI2NWExYjJjM2Q0ZTVmNjA3MTgyOTNhNGIifQ.c2lnbmVkLWVsc2V3aGVyZQ";
    for (const token of [null, "garbage", forged]) {
        const r = await api.send(method, path, body, { token });
        failed(r, 401, "unauthenticated");
        assert.match(r.headers.get("www-authenticate") ?? "", /^Bearer/);
    }
};

const recordsFor = (api: TestApi, key: string) => api.ro.col("idempotencyrecords").count({ key });

/**
 * One keyed write: sent twice with a key, the second is the first reply byte for byte with the
 * replay header; the same key with `other` (a different body, or path) is 422 and runs nothing.
 */
export const replayed = async (
    api: TestApi, send: Send, method: string, path: string, body: unknown,
    other: { body?: unknown; path?: string },
): Promise<Reply> => {
    const key = randomUUID();
    const a = await send(method, path, body, keyed(key));
    assert.ok(a.status >= 200 && a.status < 300, `${method} ${path}: ${a.status} ${a.text.slice(0, 300)}`);
    assert.equal(a.headers.get("idempotent-replayed"), null);
    const b = await send(method, path, body, keyed(key));
    assert.deepEqual([b.status, b.text, b.headers.get("idempotent-replayed")], [a.status, a.text, "true"]);
    const c = await send(method, other.path ?? path, "body" in other ? other.body : body, keyed(key));
    failed(c, 422, "idempotency_mismatch");
    assert.equal(await recordsFor(api, key), 1);
    return a;
};

/**
 * A keyed write that fails is not stored: sent again with the key it runs again (same failure,
 * no replay header), and once fixed (`good`) it runs as new under the same key.
 */
export const retriedAfterFailure = async (
    api: TestApi, send: Send, method: string, path: string,
    bad: { body?: unknown; status: number; code: string },
    good: { body?: unknown; path?: string },
): Promise<Reply> => {
    const key = randomUUID();
    for (let i = 0; i < 2; i += 1) {
        const f = await send(method, path, bad.body, keyed(key));
        failed(f, bad.status, bad.code);
        assert.equal(f.headers.get("idempotent-replayed"), null);
        assert.equal(await recordsFor(api, key), 0, "a failure is not stored");
    }
    const ok = await send(method, good.path ?? path, "body" in good ? good.body : bad.body, keyed(key));
    assert.ok(ok.status >= 200 && ok.status < 300, `${ok.status} ${ok.text.slice(0, 300)}`);
    assert.equal(ok.headers.get("idempotent-replayed"), null);
    assert.equal(await recordsFor(api, key), 1);
    return ok;
};

export const balanceOf = async (api: TestApi, id: string): Promise<number> =>
    (await api.ro.col("accounts").find<{ balance: number }>({ _id: new ObjectId(id) }))[0].balance;

export type Row = { _id: ObjectId; type: string; amount: number; account: ObjectId; toAccount?: ObjectId | null; occurredAt: Date; title?: string; note?: string; splitGroupId?: ObjectId | null; category?: ObjectId | null };
export const rowsOn = (api: TestApi, id: string) =>
    api.ro.col("transactions").find<Row>({ $or: [{ account: new ObjectId(id) }, { toAccount: new ObjectId(id) }] });
