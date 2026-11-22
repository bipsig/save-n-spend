import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fake, memoryFileSystem } from "../test/node";
import { OFFLINE_MESSAGE, WAKING_MESSAGE, type ApiError } from "./apiError";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/api.test.ts
//
// The real lib/api.ts and lib/offlineCache.ts, with fetch, the file system and the stores faked.

const fs = memoryFileSystem();
// A token shaped like the API's: the offline cache is keyed by its userId (gaps row 179).
const TOKEN = `e30.${Buffer.from(JSON.stringify({ userId: "65a1b2c3d4e5f60718293a41" })).toString("base64url")}.sig`;
const session = { token: TOKEN as string | null, signOuts: 0 };
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
  session.token = TOKEN;
  session.signOuts = 0;
  api.useServerWaking.setState({ waking: false });
  await cache.clearAll();
});
afterEach(() => mock.timers.reset());

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
  assert.equal(headers.Authorization, `Bearer ${TOKEN}`);
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

// D19: Render's free tier sleeps, and while it boots a read gets 502/503/504 or a gateway page.

const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
};
const waking = () => api.useServerWaking.getState().waking;

/** Lets a retry loop left by a test see the flag down and end, so the next test starts clean. */
const settle = async () => {
  api.useServerWaking.setState({ waking: false });
  mock.timers.tick(Math.max(...api.WAKE_RETRY_MS));
  await flush();
};

for (const status of [502, 503]) {
  test(`a ${status} from a waking server serves the saved copy and marks the server waking`, async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    answer = json(200, { success: true, data: ["cached"] });
    await api.get("/dashboard");

    answer = reply(status, "<html>Bad Gateway</html>");
    assert.deepEqual(await api.get("/dashboard"), ["cached"]);
    assert.equal(waking(), true);
    // An answer, not no signal: the offline banner stays down.
    assert.equal(reach.at(-1), "online");
    assert.deepEqual(log.at(-1)?.status, status);
    await settle();
  });
}

test("a 504 or an HTML error page is the same waking server", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  answer = json(200, { success: true, data: ["cached"] });
  await api.get("/bills");
  answer = reply(504, "");
  assert.deepEqual(await api.get("/bills"), ["cached"]);
  answer = reply(500, "<!doctype html><title>Service starting</title>");
  assert.deepEqual(await api.get("/bills"), ["cached"]);
  assert.equal(waking(), true);
  await settle();
});

test("a 502 with nothing saved is still an error, and nothing is marked", async () => {
  answer = reply(502, "<html>Bad Gateway</html>");
  const err = await failure(() => api.get("/dashboard"));
  assert.equal(err.status, 502);
  assert.equal(err.reason, WAKING_MESSAGE);
  assert.equal(waking(), false);
});

test("an export on a 502 never uses the saved copy", async () => {
  answer = json(200, { success: true, data: { items: ["cached"] } });
  await api.get("/investments/report");
  answer = reply(502, "<html>Bad Gateway</html>");
  const err = await failure(() => api.get("/investments/report", { cache: false }));
  assert.equal(err.status, 502);
  assert.equal(err.reason, WAKING_MESSAGE);
  assert.equal(waking(), false);
});

test("a write on a 502 fails as before", async () => {
  answer = json(200, { success: true, data: ["cached"] });
  await api.get("/goals");
  answer = reply(503, "<html>Service Unavailable</html>");
  assert.equal((await failure(() => api.post("/goals", { name: "x" }, { idempotencyKey: "k" }))).status, 503);
  assert.equal(waking(), false);
});

test("the API's own 503 is an answer, not a waking server", async () => {
  answer = json(200, { success: true, data: ["cached"] });
  await api.get("/dashboard");
  answer = json(503, { success: false, code: "unavailable", message: "The database is busy" });
  const err = await failure(() => api.get("/dashboard"));
  assert.equal(err.reason, "The database is busy");
  assert.equal(waking(), false);
});

test("the flag clears on the next real answer, and screens are told to refetch", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  let awake = 0;
  const off = api.onServerAwake(() => awake++);

  answer = json(200, { success: true, data: ["old"] });
  await api.get("/accounts");
  answer = reply(502, "<html>Bad Gateway</html>");
  await api.get("/accounts");
  assert.equal(waking(), true);
  assert.equal(awake, 0);

  answer = json(200, { success: true, data: ["new"] });
  assert.deepEqual(await api.get("/accounts"), ["new"]);
  assert.equal(waking(), false);
  assert.equal(awake, 1);
  off();
  await settle();
});

test("while waking, the app retries by itself with backoff until the server answers", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  let awake = 0;
  const off = api.onServerAwake(() => awake++);

  answer = json(200, { success: true, data: ["cached"] });
  await api.get("/dashboard");
  answer = reply(502, "<html>Bad Gateway</html>");
  await api.get("/dashboard");
  await api.get("/dashboard"); // a second read joins the same loop
  sent = [];

  // Nothing before the first gap; then one probe of /health per gap, each gap longer.
  mock.timers.tick(api.WAKE_RETRY_MS[0] - 1);
  await flush();
  assert.equal(sent.length, 0);
  mock.timers.tick(1);
  await flush();
  assert.deepEqual(sent.map((s) => s.url), ["http://localhost:7019/health"]);
  assert.equal(waking(), true);

  mock.timers.tick(api.WAKE_RETRY_MS[1] - 1);
  await flush();
  assert.equal(sent.length, 1);

  answer = json(200, { ok: true, db: "connected" });
  mock.timers.tick(1);
  await flush();
  assert.equal(sent.length, 2);
  assert.equal(waking(), false);
  assert.equal(awake, 1);

  // Stopped: no more probes.
  mock.timers.tick(Math.max(...api.WAKE_RETRY_MS) * 3);
  await flush();
  assert.equal(sent.length, 2);
  off();
});

test("no signal while waking hands over to the offline banner", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  answer = json(200, { success: true, data: ["cached"] });
  await api.get("/dashboard");
  answer = reply(502, "<html>Bad Gateway</html>");
  await api.get("/dashboard");
  answer = noSignal;
  assert.deepEqual(await api.get("/dashboard"), ["cached"]);
  assert.equal(waking(), false);
  assert.equal(reach.at(-1), "offline");
  await settle();
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

// 2.8.3: what lib/query reads through.

test("a read says when its data was fetched; a saved copy, when it was saved", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
  answer = json(200, { success: true, data: ["fresh"] });
  assert.deepEqual(await api.getFetched("/budgets"), { data: ["fresh"], fetchedAt: 1_000_000 });
  await flush();

  mock.timers.tick(3_600_000);
  answer = noSignal;
  assert.deepEqual(await api.getFetched("/budgets"), { data: ["fresh"], fetchedAt: 1_000_000 });

  // D19: a waking server's 502 or gateway page serves the same saved copy and its time.
  for (const waking of [reply(502, "<html>Bad Gateway</html>"), reply(500, "<!doctype html><title>Starting</title>")]) {
    answer = waking;
    assert.deepEqual(await api.getFetched("/budgets"), { data: ["fresh"], fetchedAt: 1_000_000 });
    assert.equal(api.useServerWaking.getState().waking, true);
  }
  await settle();
});

test("a write marks the reads stale; the outbox's rows wait for the end of the pass", async () => {
  const { queryClient } = require("./queryClient") as typeof import("./queryClient");
  const key = ["api", "u1", "/dashboard/summary"];
  queryClient.setQueryData(key, { data: 1, fetchedAt: 0 });

  answer = json(201, { success: true, data: { _id: "t1" } });
  await api.post("/transactions", { amount: 1 }, { idempotencyKey: "k", invalidate: false });
  assert.equal(queryClient.getQueryState(key)?.isInvalidated, false);

  await api.post("/transactions", { amount: 1 }, { idempotencyKey: "k2" });
  assert.equal(queryClient.getQueryState(key)?.isInvalidated, true);

  // A refused write changes nothing.
  queryClient.setQueryData(key, { data: 1, fetchedAt: 0 });
  answer = json(400, { success: false, code: "invalid_input", message: "No" });
  await failure(() => api.post("/transactions", {}, { idempotencyKey: "k3" }));
  assert.equal(queryClient.getQueryState(key)?.isInvalidated, false);
  queryClient.clear();
});
