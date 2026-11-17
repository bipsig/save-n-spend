import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { InfiniteQueryObserver, QueryClient, QueryObserver, notifyManager, onlineManager, type QueryKey } from "@tanstack/react-query";
import "../test/node"; // resolves "@/" before the modules below load

const { queryClient } = require("./queryClient") as typeof import("./queryClient");
const { apiKey, refetchActive, refetchIfStale, screenRefetch, statusOf, wireQueries } =
  require("./query/core") as typeof import("./query/core");
const { afterWrite, readsChangedBy } = require("./query/invalidate") as typeof import("./query/invalidate");
const { ApiError } = require("./apiError") as typeof import("./apiError");

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/fetchLayer.test.ts
//
// The rules lib/query/useApiQuery.ts applies, run against a real QueryClient with the app's
// defaults. A QueryObserver is what useQuery puts on a mounted screen.

notifyManager.setScheduler((cb) => cb());

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
};

const freshClient = () => new QueryClient({ defaultOptions: queryClient.getDefaultOptions() });

/** A screen's read: counts its requests; each answer can be held back until released. */
const endpoint = <T>(answer: (path: string) => T) => {
  const sent: string[] = [];
  let hold = false;
  const waiting: (() => void)[] = [];
  const fn = (path: string) => async () => {
    sent.push(path);
    if (hold) await new Promise<void>((resolve) => waiting.push(resolve));
    return { data: answer(path), fetchedAt: Date.now() };
  };
  return {
    sent,
    fn,
    hold: () => { hold = true; },
    release: (i: number) => waiting[i](),
  };
};

const mount = <T>(client: QueryClient, key: QueryKey, queryFn: () => Promise<T>) => {
  const observer = new QueryObserver(client, { queryKey: key, queryFn });
  const off = observer.subscribe(() => {});
  return { observer, off };
};

const age = (client: QueryClient, key: QueryKey, ms: number) =>
  client.getQueryCache().find({ queryKey: key, exact: true })!.setState({ dataUpdatedAt: Date.now() - ms });

beforeEach(() => queryClient.clear());

test("stepping periods fast: a slow answer for the old period never shows under the new one", async () => {
  const client = freshClient();
  const api = endpoint((path) => ({ period: path }));
  api.hold();
  const july = "/insights?period=month&offset=-1";
  const august = "/insights?period=month&offset=0";
  const { observer, off } = mount(client, apiKey("u1", july), api.fn(july));
  observer.setOptions({ queryKey: apiKey("u1", august), queryFn: api.fn(august) });
  await flush();

  api.release(1); // August answers first
  await flush();
  assert.deepEqual(observer.getCurrentResult().data?.data, { period: august });
  api.release(0); // then July's late answer lands
  await flush();
  assert.deepEqual(observer.getCurrentResult().data?.data, { period: august });
  // It is kept for July, where it belongs.
  assert.deepEqual(client.getQueryData<{ data: unknown }>(apiKey("u1", july))?.data, { period: july });
  off();
});

test("opening a screen sends one request; the focus rule on fresh data sends none", async () => {
  const client = freshClient();
  const api = endpoint(() => ["bill"]);
  const key = apiKey("u1", "/bills");
  api.hold();
  const { off } = mount(client, key, api.fn("/bills"));
  const focus = refetchIfStale(client, key); // focus while the open fetch runs: joins it
  api.release(0);
  await focus;
  await flush();
  assert.equal(api.sent.length, 1);

  await refetchIfStale(client, key);
  assert.equal(api.sent.length, 1);
  off();
});

test("refocus refetches only data older than 30 s", async () => {
  const client = freshClient();
  const api = endpoint(() => ["goal"]);
  const key = apiKey("u1", "/goals");
  const { off } = mount(client, key, api.fn("/goals"));
  await flush();
  assert.equal(api.sent.length, 1);

  age(client, key, 29_000);
  await refetchIfStale(client, key);
  assert.equal(api.sent.length, 1);

  age(client, key, 31_000);
  await refetchIfStale(client, key);
  assert.equal(api.sent.length, 2);

  // A screen's refetch (pull to refresh, Try again) always asks, even on fresh data.
  await screenRefetch(client, key);
  assert.equal(api.sent.length, 3);
  await screenRefetch(client, key);
  assert.equal(api.sent.length, 4);
  off();
});

test("a pull to refresh while a load is running joins it", async () => {
  const client = freshClient();
  const api = endpoint(() => 1);
  const key = apiKey("u1", "/cash-flow");
  api.hold();
  const { off } = mount(client, key, api.fn("/cash-flow"));
  const pull = screenRefetch(client, key);
  api.release(0);
  await pull;
  assert.equal(api.sent.length, 1);
  off();
});

test("refreshing a long list asks for page one only", async () => {
  const client = freshClient();
  const sent: number[] = [];
  const key = apiKey("u1", "/transactions?page=1&limit=20");
  const observer = new InfiniteQueryObserver(client, {
    queryKey: key,
    initialPageParam: 1,
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      sent.push(pageParam);
      return { data: { items: [pageParam], page: pageParam, hasNextPage: true }, fetchedAt: Date.now() };
    },
    getNextPageParam: (last: { data: { page: number } }) => last.data.page + 1,
  });
  const off = observer.subscribe(() => {});
  await flush();
  await observer.fetchNextPage();
  await observer.fetchNextPage();
  assert.deepEqual(sent, [1, 2, 3]);

  await screenRefetch(client, key, true);
  assert.deepEqual(sent, [1, 2, 3, 1]);
  assert.equal(observer.getCurrentResult().data?.pages.length, 1);
  off();
});

test("a write refetches what it changed on mounted screens, and marks the rest stale", async () => {
  const bills = endpoint(() => ["bill"]);
  const recurring = endpoint(() => ({ expenses: [], income: [] }));
  const a = mount(queryClient, apiKey("u1", "/bills"), bills.fn("/bills"));
  const b = mount(queryClient, apiKey("u1", "/recurring"), recurring.fn("/recurring"));
  // A screen that is no longer mounted.
  await queryClient.fetchQuery({ queryKey: apiKey("u1", "/goals"), queryFn: endpoint(() => []).fn("/goals") });
  await flush();
  assert.deepEqual([bills.sent.length, recurring.sent.length], [1, 1]);

  afterWrite("/bills/6a76f00dc0ffee0000c688aa/pay", { amount: 1 });
  await flush();
  assert.deepEqual([bills.sent.length, recurring.sent.length], [2, 2]);
  assert.equal(queryClient.getQueryState(apiKey("u1", "/goals"))?.isInvalidated, true);

  afterWrite("/recurring/dismiss", { key: "x" });
  await flush();
  assert.deepEqual([bills.sent.length, recurring.sent.length], [2, 3]);

  afterWrite("/auth/login", {});
  afterWrite("/notifications/read-all");
  afterWrite("/users/me", { pushToken: "t" });
  await flush();
  assert.deepEqual([bills.sent.length, recurring.sent.length], [2, 3]);
  a.off();
  b.off();
});

test("which reads a write changes", () => {
  assert.equal(readsChangedBy("/transactions"), "all");
  assert.equal(readsChangedBy("/budgets/b1"), "all");
  assert.equal(readsChangedBy("/trips/t1/import/commit"), "all");
  assert.deepEqual(readsChangedBy("/trips/t1/import/preview"), []);
  assert.equal(readsChangedBy("/users/me", { prefs: { timeZone: "Asia/Kolkata" } }), "all");
  assert.deepEqual(readsChangedBy("/users/me", { prefs: { defaultAccount: "a1" } }), []);
  assert.deepEqual(readsChangedBy("/users/me", { name: "S" }), []);
  assert.deepEqual(readsChangedBy("/recurring/dismiss"), ["recurring"]);
});

test("when the server wakes, mounted screens refetch once; the account changing empties the cache", async () => {
  const client = freshClient();
  let awake = () => {};
  type S = { status: string; user: { _id: string } | null };
  let onSession: (s: S, prev: S) => void = () => {};
  const off = wireQueries(
    client,
    (listener) => { awake = listener; return () => {}; },
    { subscribe: (listener) => { onSession = listener; return () => {}; } },
    { subscribe: () => () => {} },
  );

  const shown = endpoint(() => ["saved"]);
  const gone = endpoint(() => ["old"]);
  const screen = mount(client, apiKey("u1", "/dashboard/summary"), shown.fn("/dashboard/summary"));
  await client.fetchQuery({ queryKey: apiKey("u1", "/goals"), queryFn: gone.fn("/goals") });
  await flush();
  assert.deepEqual([shown.sent.length, gone.sent.length], [1, 1]);

  awake();
  await flush();
  assert.deepEqual([shown.sent.length, gone.sent.length], [2, 1]);

  const signedIn = { status: "authed", user: { _id: "u1" } };
  onSession({ ...signedIn }, signedIn); // the same user again (a profile save): kept
  assert.ok(client.getQueryData(apiKey("u1", "/goals")));
  onSession({ status: "guest", user: null }, signedIn);
  assert.equal(client.getQueryCache().getAll().length, 0);
  screen.off();
  off();
});

test("refetchActive leaves screens that are not mounted alone", async () => {
  const client = freshClient();
  const api = endpoint(() => 1);
  await client.fetchQuery({ queryKey: apiKey("u1", "/reviews?period=month&offset=-1"), queryFn: api.fn("r") });
  await refetchActive(client);
  assert.equal(api.sent.length, 1);
});

test("errorStatus: the latest failure's status, 0 offline, null once a load succeeds", async () => {
  const client = freshClient();
  const key = apiKey("u1", "/trips/t9");
  let fail: Error | null = new ApiError("Trip not found", 404);
  const observer = new QueryObserver(client, {
    queryKey: key,
    queryFn: async () => { if (fail) throw fail; return { data: 1, fetchedAt: Date.now() }; },
  });
  const off = observer.subscribe(() => {});
  await flush();
  assert.equal(statusOf(observer.getCurrentResult().error), 404);

  fail = new ApiError("Couldn't reach the server", 0);
  await observer.refetch();
  assert.equal(statusOf(observer.getCurrentResult().error), 0);

  fail = new Error("not a request's");
  await observer.refetch();
  assert.equal(statusOf(observer.getCurrentResult().error), null);

  fail = null;
  await observer.refetch();
  assert.equal(statusOf(observer.getCurrentResult().error), null);
  off();
});

test("back online, mounted screens refetch once; going offline or staying online sends nothing", async () => {
  const client = freshClient();
  type C = { offline: boolean };
  let onConnectivity: (s: C, prev: C) => void = () => {};
  const off = wireQueries(
    client,
    () => () => {},
    { subscribe: () => () => {} },
    { subscribe: (listener) => { onConnectivity = listener; return () => {}; } },
  );
  const shown = endpoint(() => ["saved"]);
  const gone = endpoint(() => ["old"]);
  const screen = mount(client, apiKey("u1", "/bills"), shown.fn("/bills"));
  await client.fetchQuery({ queryKey: apiKey("u1", "/goals"), queryFn: gone.fn("/goals") });
  await flush();
  assert.deepEqual([shown.sent.length, gone.sent.length], [1, 1]);

  onConnectivity({ offline: true }, { offline: false });
  await flush();
  assert.equal(onlineManager.isOnline(), false);
  assert.equal(shown.sent.length, 1);

  onConnectivity({ offline: false }, { offline: true });
  await flush();
  assert.equal(onlineManager.isOnline(), true);
  assert.deepEqual([shown.sent.length, gone.sent.length], [2, 1]);

  onConnectivity({ offline: false }, { offline: false });
  await flush();
  assert.equal(shown.sent.length, 2);
  screen.off();
  off();
});
