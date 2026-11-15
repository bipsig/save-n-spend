import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fake, memoryFileSystem } from "../test/node";
import { OFFLINE_MESSAGE, WAKING_MESSAGE, type ApiError } from "./apiError";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/api.test.ts
//
// The real lib/api.ts and lib/offlineCache.ts, with fetch, the file system and the stores faked.

const fs = memoryFileSystem();
const session = { token: "tok" as string | null, signOuts: 0 };
const reach: string[] = [];
const log: { status: number; route: string; message?: string }[] = [];

fake("expo-file-system/legacy", fs.api);
fake("expo-constants", { __esModule: true, default: { expoConfig: { version: "2.8.1" } } });
fake("@/store/session", {
  useSession: { getState: () => ({ token: session.token, signOut: async () => { session.signOuts++; } }) },
});
fake("@/store/connectivity", {
  useConnectivity: { getState: () => ({ reportOnline: () => reach.push("online"), reportOffline: () => reach.push("offline") }) },
});
fake("@/store/requestLog", { useRequestLog: { getState: () => ({ add: (e: (typeof log)[number]) => log.push(e) }) } });

const api = require("./api") as typeof import("./api");
const cache = require("./offlineCache") as typeof import("./offlineCache");

type Sent = { url: string; method: string; headers: Record<string, string>; body?: string };
let sent: Sent[] = [];
let answer: () => Promise<Response>;

const reply = (status: number, body: string, headers: Record<string, string> = {}) => () =>
  Promise.resolve(new Response(status === 204 ? null : body, { status, headers }));
const json = (status: number, value: unknown, headers?: Record<string, string>) => reply(status, JSON.stringify(value), headers);
const noSignal = () => Promise.reject(new TypeError("Network request failed"));

globalThis.fetch = (async (url: string, init: RequestInit) => {
  sent.push({ url, method: init.method!, headers: init.headers as Record<string, string>, body: init.body as string | undefined });
  return answer();
}) as typeof fetch;

beforeEach(async () => {
  sent = [];
  reach.length = 0;
  log.length = 0;
  session.token = "tok";
  session.signOuts = 0;
  await cache.clearAll();
});

const failure = async (run: () => Promise<unknown>): Promise<ApiError> => {
  try {
    await run();
  }
  catch (err) {
    return err as ApiError;
  }
  throw new Error("expected the request to fail");
};

test("every request names the app version, a request id and the token", async () => {
  answer = json(200, { success: true, data: [] });
  await api.get("/accounts");
  const { url, method, headers } = sent[0];
  assert.equal(url, "http://localhost:7019/api/v1/accounts");
  assert.equal(method, "GET");
  assert.equal(headers["X-App-Version"], "2.8.1");
  assert.match(headers["X-Request-Id"], /^[2-9A-HJKMNP-Z]{6}$/);
  assert.equal(headers.Authorization, "Bearer tok");
  assert.equal(headers["Idempotency-Key"], undefined);

  session.token = null;
  await api.get("/accounts");
  assert.equal(sent[1].headers.Authorization, undefined);
});

test("a keyed write sends its Idempotency-Key and its body", async () => {
  answer = json(201, { success: true, data: { _id: "t1" } });
  for (const [send, method] of [
    [() => api.post("/transactions", { amount: 100 }, { idempotencyKey: "k-post" }), "POST"],
    [() => api.put("/transactions/t1", { amount: 100 }, { idempotencyKey: "k-put" }), "PUT"],
    [() => api.patch("/accounts/a1/balance", { amount: 100 }, { idempotencyKey: "k-patch" }), "PATCH"],
    [() => api.del("/bills/b1", { idempotencyKey: "k-delete" }), "DELETE"],
  ] as const) {
    sent = [];
    await send();
    assert.equal(sent[0].method, method);
    assert.equal(sent[0].headers["Idempotency-Key"], `k-${method.toLowerCase()}`);
    assert.equal(sent[0].body, method === "DELETE" ? undefined : JSON.stringify({ amount: 100 }));
  }
});

test("a 2xx is unwrapped, reports online and is logged", async () => {
  answer = json(200, { success: true, message: "OK", data: { _id: "a1" } });
  assert.deepEqual(await api.get("/accounts/6a76f00dc0ffee0000c688aa"), { _id: "a1" });
  assert.deepEqual(reach, ["online"]);
  assert.deepEqual(log.map((e) => [e.status, e.route]), [[200, "/accounts/:id"]]);
});

test("an empty 2xx body is a success with no data", async () => {
  answer = reply(204, "");
  assert.equal(await api.del("/goals/g1", { idempotencyKey: "k" }), null);
  answer = reply(200, "");
  assert.equal(await api.post("/notifications/read"), null);
});

test("a replayed reply is a success, with or without the record", async () => {
  answer = json(200, { success: true, message: "This was already saved", data: null }, { "Idempotent-Replayed": "true" });
  assert.equal(await api.post("/goals/g1/contribute", { amount: 1 }, { idempotencyKey: "k" }), null);
  answer = json(201, { success: true, data: { _id: "t1" } }, { "Idempotent-Replayed": "true" });
  assert.deepEqual(await api.post("/transactions", {}, { idempotencyKey: "k" }), { _id: "t1" });
});

test("an error reply keeps its code, field errors, Retry-After and reference", async () => {
  answer = json(400, {
    success: false, code: "invalid_input", message: "Amount must be more than zero",
    issues: [{ path: "amount", message: "Amount must be more than zero" }],
  });
  const err = await failure(() => api.post("/transactions", { amount: 0 }, { idempotencyKey: "k" }));
  assert.equal(err.status, 400);
  assert.equal(err.code, "invalid_input");
  assert.deepEqual(err.issues, [{ path: "amount", message: "Amount must be more than zero" }]);
  assert.equal(err.requestId, sent[0].headers["X-Request-Id"]);
  assert.equal(err.message, `Amount must be more than zero · Ref ${err.requestId}`);
  // A refusal is still an answer: the server is reachable.
  assert.deepEqual(reach, ["online"]);

  answer = json(429, { success: false, code: "rate_limited", message: "Too many tries" }, { "Retry-After": "30" });
  assert.equal((await failure(() => api.post("/auth/login", {}))).retryAfterMs, 30_000);
});

test("a 401 signs out, except on the auth routes", async () => {
  answer = json(401, { success: false, code: "unauthenticated", message: "Sign in again" });
  await failure(() => api.get("/accounts"));
  assert.equal(session.signOuts, 1);
  await failure(() => api.post("/auth/login", { email: "a", password: "b" }));
  assert.equal(session.signOuts, 1);
});

test("offline, a GET answers from its last copy", async () => {
  answer = json(200, { success: true, data: [{ _id: "c1" }] });
  await api.get("/categories?include=archived");

  answer = noSignal;
  assert.deepEqual(await api.get("/categories?include=archived"), [{ _id: "c1" }]);
  assert.deepEqual(reach, ["online", "offline"]);
  assert.deepEqual([log.at(-1)?.status, log.at(-1)?.message], [0, "No response"]);
});

test("offline with nothing cached, a GET fails as no answer", async () => {
  answer = noSignal;
  const err = await failure(() => api.get("/categories?include=archived"));
  assert.equal(err.status, 0);
  assert.equal(err.message, OFFLINE_MESSAGE);
});

test("a write is never answered from the cache", async () => {
  answer = json(200, { success: true, data: { _id: "t1" } });
  await api.get("/transactions");
  answer = noSignal;
  const err = await failure(() => api.post("/transactions", {}, { idempotencyKey: "k" }));
  assert.equal(err.status, 0);
  // Only GETs are written to the cache.
  answer = json(201, { success: true, data: { _id: "t2" } });
  await api.post("/goals", { name: "x" }, { idempotencyKey: "k2" });
  answer = noSignal;
  assert.equal((await failure(() => api.get("/goals"))).status, 0);
});

test("a 2xx that isn't the API's (a Wi-Fi sign-in page) is no answer, not a success", async () => {
  answer = json(200, { success: true, data: ["cached"] });
  await api.get("/bills");
  answer = reply(200, "<html>Sign in to the Wi-Fi</html>");
  assert.deepEqual(await api.get("/bills"), ["cached"]);
  assert.equal(reach.at(-1), "offline");
  assert.equal((await failure(() => api.post("/bills", {}, { idempotencyKey: "k" }))).status, 0);
});

// Today's behaviour: a gateway page while Render wakes reaches the screen as an error even
// when a cached copy exists. A fallback is planned for 2.8.2 (D19 A).
test("a 502 or 503 page from a waking server is an error, not the cached copy", async () => {
  answer = json(200, { success: true, data: ["cached"] });
  await api.get("/dashboard");
  for (const status of [502, 503]) {
    answer = reply(status, "<html>Bad Gateway</html>");
    const err = await failure(() => api.get("/dashboard"));
    assert.equal(err.status, status);
    assert.equal(err.reason, WAKING_MESSAGE);
  }
});

test("an export read is never answered from the cache: no answer fails as offline", async () => {
  answer = json(200, { success: true, data: { items: ["cached"] } });
  await api.get("/investments/report");
  answer = noSignal;
  const err = await failure(() => api.get("/investments/report", { cache: false }));
  assert.equal(err.status, 0);
  assert.equal(err.message, OFFLINE_MESSAGE);
  // A Wi-Fi sign-in page is no answer too.
  answer = reply(200, "<html>Sign in to the Wi-Fi</html>");
  assert.equal((await failure(() => api.get("/investments/report", { cache: false }))).status, 0);
  // The screen's own read still falls back.
  answer = noSignal;
  assert.deepEqual(await api.get("/investments/report"), { items: ["cached"] });
});

test("an export read is never written to the cache", async () => {
  answer = json(200, { success: true, data: { items: ["fresh"] } });
  assert.deepEqual(await api.get("/transactions?page=1&limit=100", { cache: false }), { items: ["fresh"] });
  answer = noSignal;
  assert.equal((await failure(() => api.get("/transactions?page=1&limit=100"))).status, 0);

  // Nor does it replace what a screen cached.
  answer = json(200, { success: true, data: ["screen"] });
  await api.get("/insights?period=month&offset=0");
  answer = json(200, { success: true, data: ["export"] });
  await api.get("/insights?period=month&offset=0", { cache: false });
  answer = noSignal;
  assert.deepEqual(await api.get("/insights?period=month&offset=0"), ["screen"]);
});

test("every request the export files make opts out of the cache", () => {
  // Read from the source: these files pull in expo-print and the theme, which node can't load.
  for (const file of ["export.ts", "insightsExport.ts", "investmentsExport.ts"]) {
    const src = readFileSync(join(__dirname, file), "utf8");
    const calls = src.split("\n").filter((line) => /(?<![\w.])get[<(]/.test(line));
    assert.ok(calls.length > 0, `${file}: no get() found`);
    for (const args of calls) assert.match(args, /\{ cache: false \}/, `${file}: ${args}`);
    assert.doesNotMatch(src, /\b(post|put|patch|del)\(/, `${file} writes`);
  }
});
