import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "zustand/vanilla";
import { fake, memoryFileSystem, relaunch } from "../test/node";
import type { PersistedDelete } from "./pendingDeleteReplay";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/pendingDeleteStore.test.ts
//
// The real store/pendingDeletes.ts and lib/pendingDeleteFile.ts on an in-memory disk, with the
// API, the session and connectivity faked. A "launch" is a fresh copy of the modules over the
// same disk; the old copy's timer never fires, as after a kill.

const ID = "6a76f00dc0ffee0000c688aa";
const KEY = `transaction:${ID}`;
const FILE = "file:///doc/pending-deletes/u1.json";

type Sent = { method: string; path: string; key?: string };
type ApiErrors = typeof import("./apiError");
/** Built from the copy of lib/apiError the launched store loaded, so `instanceof` holds. */
type Answer = (errors: ApiErrors) => Error;

const launch = (fs: ReturnType<typeof memoryFileSystem>, answers: Answer[] = []) => {
  const sent: Sent[] = [];
  const toasts: string[] = [];
  const session = createStore<{ status: string; user: { _id: string } | null }>(() => ({ status: "loading", user: null }));
  const connectivity = createStore<{ offline: boolean }>(() => ({ offline: false }));
  const answer = async () => {
    const next = answers.shift();
    if (next) throw next(require("./apiError") as ApiErrors);
    return null;
  };
  fake("expo-file-system/legacy", fs.api);
  fake("@/store/session", { useSession: session });
  fake("@/store/connectivity", { useConnectivity: connectivity });
  fake("@/store/toast", { toast: { fromError: (_err: unknown, text: string) => toasts.push(text) } });
  fake("@/store/accounts", { useAccountStore: { getState: () => ({ load: async () => {} }) } });
  const api = {
    del: (path: string, opts?: { idempotencyKey?: string }) => { sent.push({ method: "DELETE", path, key: opts?.idempotencyKey }); return answer(); },
    patch: (path: string) => { sent.push({ method: "PATCH", path }); return Promise.resolve(null); },
  };
  fake("@/lib/api", api);
  relaunch();
  const store = require("../store/pendingDeletes") as typeof import("../store/pendingDeletes");
  const signIn = () => session.setState({ status: "authed", user: { _id: "u1" } });
  return { store, api, sent, toasts, session, connectivity, signIn };
};

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
};
const onDisk = (fs: ReturnType<typeof memoryFileSystem>): PersistedDelete[] => JSON.parse(fs.files.get(FILE) ?? "[]");

/** What a screen's commit does: the DELETE, with the key the store hands it. */
const commitVia = (app: ReturnType<typeof launch>) => async (opts: { idempotencyKey?: string }) => {
  await app.api.del(`/transactions/${ID}`, opts);
};

beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
afterEach(() => mock.timers.reset());

test("a confirmed delete is on disk at once; Undo takes it off and nothing is sent", async () => {
  const fs = memoryFileSystem();
  const app = launch(fs);
  app.signIn();
  await settle();
  app.store.pendingDeletes.schedule(KEY, "Tea", commitVia(app));
  await settle();
  assert.deepEqual(onDisk(fs).map((i) => [i.key, i.requests[0].path]), [[KEY, `/transactions/${ID}`]]);
  assert.equal(app.store.usePendingDeletes.getState().keys.has(KEY), true);

  app.store.pendingDeletes.cancel(KEY);
  await settle();
  mock.timers.tick(10_000);
  await settle();
  assert.deepEqual(onDisk(fs), []);
  assert.deepEqual(app.sent, []);
  assert.equal(app.store.usePendingDeletes.getState().keys.has(KEY), false);
});

test("the undo window ends: sent once with its key, then off the disk and not replayed", async () => {
  const fs = memoryFileSystem();
  const app = launch(fs);
  app.signIn();
  await settle();
  app.store.pendingDeletes.schedule(KEY, "Tea", commitVia(app));
  await settle();
  const key = onDisk(fs)[0].idempotencyKey;
  mock.timers.tick(5_000);
  await settle();
  assert.deepEqual(app.sent, [{ method: "DELETE", path: `/transactions/${ID}`, key }]);
  assert.deepEqual(onDisk(fs), []);

  const next = launch(fs);
  next.signIn();
  await settle();
  assert.deepEqual(next.sent, []);
});

test("killed inside the undo window: the next launch sends it once, with the same key", async () => {
  const fs = memoryFileSystem();
  const first = launch(fs);
  first.signIn();
  await settle();
  first.store.pendingDeletes.schedule(KEY, "Tea", commitVia(first));
  await settle();
  const key = onDisk(fs)[0].idempotencyKey;

  const next = launch(fs);
  next.signIn();
  await settle();
  assert.deepEqual(next.sent, [{ method: "DELETE", path: `/transactions/${ID}`, key }]);
  assert.deepEqual(onDisk(fs), []);
  // Hidden for this run: the user saw it go.
  assert.equal(next.store.usePendingDeletes.getState().keys.has(KEY), true);

  // A reconnect and another launch find nothing left to send.
  next.connectivity.setState({ offline: true });
  next.connectivity.setState({ offline: false });
  await settle();
  const third = launch(fs);
  third.signIn();
  await settle();
  assert.equal(next.sent.length + third.sent.length, 1);
});

test("still offline at the next launch: kept on disk, then sent on reconnect", async () => {
  const fs = memoryFileSystem();
  const first = launch(fs);
  first.signIn();
  await settle();
  first.store.pendingDeletes.schedule(KEY, "Tea", commitVia(first));
  await settle();
  const key = onDisk(fs)[0].idempotencyKey;

  const next = launch(fs, [(e) => e.offlineError(null)]);
  next.signIn();
  await settle();
  assert.equal(next.sent.length, 1);
  assert.equal(onDisk(fs).length, 1);

  next.connectivity.setState({ offline: true });
  next.connectivity.setState({ offline: false });
  await settle();
  assert.deepEqual(next.sent.map((s) => s.key), [key, key]);
  assert.deepEqual(onDisk(fs), []);
});

test("a delete still in its undo window is left to its timer, not replayed", async () => {
  const fs = memoryFileSystem();
  const app = launch(fs);
  app.signIn();
  await settle();
  app.store.pendingDeletes.schedule(KEY, "Tea", commitVia(app));
  await settle();
  await app.store.replayPendingDeletes("u1");
  assert.deepEqual(app.sent, []);
  app.store.pendingDeletes.cancel(KEY);
  await settle();
  assert.deepEqual(onDisk(fs), []);
});

test("a refused replay brings the row back and says so", async () => {
  const fs = memoryFileSystem();
  const first = launch(fs);
  first.signIn();
  await settle();
  first.store.pendingDeletes.schedule(KEY, "Tea", commitVia(first));
  await settle();

  const refused: Answer = (e) => e.errorFromResponse(409, JSON.stringify({ success: false, code: "conflict", message: "Settle it first" }), {}, "AAAAAA");
  const next = launch(fs, [refused]);
  next.signIn();
  await settle();
  assert.deepEqual(onDisk(fs), []);
  assert.equal(next.store.usePendingDeletes.getState().keys.has(KEY), false);
  assert.deepEqual(next.toasts, ["Couldn't delete Tea — it's back"]);
});
