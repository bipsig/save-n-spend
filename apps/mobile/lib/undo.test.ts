import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "zustand/vanilla";
import { fake, memoryFileSystem, relaunch } from "../test/node";
import type { PersistedDelete } from "./pendingDeleteReplay";
import { UNDO_COPY, deleteTarget, deletedMessage, previousValues, undoOutcome } from "./undoCopy";
import { ApiError, offlineError } from "./apiError";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/undo.test.ts
//
// lib/undo.ts over the real store/pendingDeletes.ts and an in-memory disk, with the API, the
// query cache, the session, connectivity and the toast faked.

const ID = "6a76f00dc0ffee0000c688aa";
const TRIP = "6a76f00dc0ffee0000c688bb";
const FILE = "file:///doc/pending-deletes/u1.json";

type Sent = { method: string; path: string; key?: string; ifMatch?: string; body?: unknown };
type Toast = { tone: string; message: string; action?: { label: string; onPress: () => void } };

const launch = (opts: { answer?: (s: Sent) => Promise<unknown>; offline?: boolean } = {}) => {
  const fs = memoryFileSystem();
  const sent: Sent[] = [];
  const toasts: Toast[] = [];
  const events: string[] = [];
  let finishReload: () => void = () => {};
  const session = createStore<{ status: string; user: { _id: string } | null }>(() => ({ status: "authed", user: { _id: "u1" } }));
  const connectivity = createStore<{ offline: boolean }>(() => ({ offline: opts.offline ?? false }));
  const answer = opts.answer ?? (async () => ({}));
  fake("expo-file-system/legacy", fs.api);
  fake("@/store/session", { useSession: session });
  fake("@/store/connectivity", { useConnectivity: connectivity });
  fake("@/store/accounts", { useAccountStore: { getState: () => ({ load: async () => {} }) } });
  const show = (tone: string) => (message: string) => toasts.push({ tone, message });
  fake("@/store/toast", {
    toast: {
      success: show("success"), error: show("error"), info: show("info"), warning: show("warning"),
      fromError: (err: unknown, fallback: string) => toasts.push({ tone: "error", message: err instanceof Error ? err.message : fallback }),
      action: (tone: string, message: string, action: Toast["action"]) => toasts.push({ tone, message, action }),
    },
  });
  fake("@/lib/query/invalidate", {
    readsChangedBy: () => "all",
    // Resolves only when the test says the screens have reloaded.
    invalidateReads: () => new Promise<void>((resolve) => { events.push("reload"); finishReload = () => { events.push("reloaded"); resolve(); }; }),
  });
  fake("@/lib/api", {
    del: (path: string, o?: { idempotencyKey?: string }) => { const s = { method: "DELETE", path, key: o?.idempotencyKey }; sent.push(s); return answer(s); },
    patch: (path: string, body?: unknown, o?: { ifMatch?: string; idempotencyKey?: string }) => { const s = { method: "PATCH", path, body, ifMatch: o?.ifMatch, key: o?.idempotencyKey }; sent.push(s); return answer(s); },
  });
  relaunch();
  const undo = require("./undo") as typeof import("./undo");
  const store = require("../store/pendingDeletes") as typeof import("../store/pendingDeletes");
  const onDisk = (): PersistedDelete[] => JSON.parse(fs.files.get(FILE) ?? "[]");
  return { undo, store, sent, toasts, events, onDisk, reloaded: () => finishReload(), connectivity };
};

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
};

beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
afterEach(() => mock.timers.reset());

test("every record has its key and DELETE, cascades included", () => {
  assert.deepEqual(
    [
      deleteTarget.transaction(ID), deleteTarget.goal(ID), deleteTarget.bill(ID), deleteTarget.category(ID), deleteTarget.account(ID),
      deleteTarget.budget(ID), deleteTarget.trip(TRIP), deleteTarget.tripExpense(TRIP, ID), deleteTarget.investment(ID, "keep"), deleteTarget.plan(TRIP),
    ].map((t) => [t.key, t.request.method, t.request.path]),
    [
      [`transaction:${ID}`, "DELETE", `/transactions/${ID}`], [`goal:${ID}`, "DELETE", `/goals/${ID}`], [`bill:${ID}`, "DELETE", `/bills/${ID}`],
      [`category:${ID}`, "DELETE", `/categories/${ID}`], [`account:${ID}`, "DELETE", `/accounts/${ID}`], [`budget:${ID}`, "DELETE", `/budgets/${ID}`],
      [`trip:${TRIP}`, "DELETE", `/trips/${TRIP}`], [`tripExpense:${ID}`, "DELETE", `/trips/${TRIP}/expenses/${ID}`],
      [`investment:${ID}`, "DELETE", `/investments/${ID}?mode=keep`], [`plan:${TRIP}`, "DELETE", `/trips/${TRIP}/plan`],
    ],
  );
  assert.equal(deleteTarget.investment(ID, "undo").request.path, `/investments/${ID}?mode=undo`);
});

test("delete toasts name what goes with the record", () => {
  assert.equal(deletedMessage("Swiggy"), "Swiggy deleted");
  assert.equal(deletedMessage("Goa 2026", [[14, "expense", "expenses"]]), "Goa 2026 deleted with 14 expenses");
  assert.equal(deletedMessage("Goa 2026", [[1, "expense", "expenses"]]), "Goa 2026 deleted with 1 expense");
  assert.equal(deletedMessage("ICICI Pru", [[12, "payment", "payments"], [3, "value update", "value updates"]]), "ICICI Pru deleted with 12 payments and 3 value updates");
  assert.equal(deletedMessage("ICICI Pru", [[0, "payment", "payments"], [0, "value update", "value updates"]]), "ICICI Pru deleted");
});

for (const [kind, t] of [
  ["budget", deleteTarget.budget(ID)],
  ["trip (cascade)", deleteTarget.trip(TRIP)],
  ["trip expense (cascade)", deleteTarget.tripExpense(TRIP, ID)],
  ["investment (cascade, keep)", deleteTarget.investment(ID, "keep")],
  ["plan", deleteTarget.plan(TRIP)],
  ["goal", deleteTarget.goal(ID)],
] as const) {
  test(`deleteWithUndo, ${kind}: held, on disk with its own request, sent once after the window`, async () => {
    const app = launch();
    await settle();
    app.undo.deleteWithUndo({ ...t, label: "Goa 2026", message: "Goa 2026 deleted" });
    await settle();
    assert.deepEqual(app.onDisk().map((i) => [i.key, i.requests[0].path]), [[t.key, t.request.path]]);
    assert.equal(app.store.usePendingDeletes.getState().keys.has(t.key), true);
    assert.deepEqual(app.toasts.map((x) => [x.tone, x.message, x.action?.label]), [["info", "Goa 2026 deleted", "Undo"]]);
    assert.equal(app.sent.length, 0);

    mock.timers.tick(5_000);
    await settle();
    assert.deepEqual(app.sent.map((s) => [s.method, s.path, typeof s.key]), [["DELETE", t.request.path, "string"]]);
    assert.equal(app.sent[0].key, app.onDisk()[0]?.idempotencyKey ?? app.sent[0].key);
    // Row 64: still hidden until the screens have reloaded without it.
    assert.deepEqual(app.events, ["reload"]);
    assert.equal(app.store.usePendingDeletes.getState().keys.has(t.key), true);
    app.reloaded();
    await settle();
    assert.equal(app.store.usePendingDeletes.getState().keys.has(t.key), false);
    assert.deepEqual(app.onDisk(), []);
  });
}

test("deleteWithUndo: Undo sends nothing and shows the record again", async () => {
  const app = launch();
  await settle();
  const t = deleteTarget.trip(TRIP);
  app.undo.deleteWithUndo({ ...t, label: "Goa 2026", message: "Goa 2026 deleted with 14 expenses" });
  await settle();
  app.toasts[0].action!.onPress();
  await settle();
  mock.timers.tick(10_000);
  await settle();
  assert.deepEqual(app.sent, []);
  assert.deepEqual(app.onDisk(), []);
  assert.equal(app.store.usePendingDeletes.getState().keys.has(t.key), false);
});

test("deleteWithUndo: `after` is sent once the DELETE lands and is kept for a replay", async () => {
  const app = launch();
  await settle();
  const after = [{ method: "PATCH" as const, path: "/users/me", body: { prefs: { defaultAccount: null } } }];
  app.undo.deleteWithUndo({ ...deleteTarget.account(ID), label: "HDFC", message: "HDFC archived", after });
  await settle();
  assert.deepEqual(app.onDisk()[0].requests.map((r) => r.path), [`/accounts/${ID}`, "/users/me"]);
  mock.timers.tick(5_000);
  await settle();
  assert.deepEqual(app.sent.map((s) => [s.method, s.path]), [["DELETE", `/accounts/${ID}`], ["PATCH", "/users/me"]]);
});

test("deleteWithUndo: a refused DELETE brings the record back and says so", async () => {
  const app = launch({ answer: async () => { throw new ApiError("That trip is closed", 409, null, { code: "conflict" }); } });
  await settle();
  const t = deleteTarget.trip(TRIP);
  app.undo.deleteWithUndo({ ...t, label: "Goa 2026", message: "Goa 2026 deleted" });
  mock.timers.tick(5_000);
  await settle();
  assert.equal(app.store.usePendingDeletes.getState().keys.has(t.key), false);
  assert.equal(app.events.length, 0);
});

const SAVED = { updatedAt: "2026-11-22T14:05:11.123Z" };

test("editWithUndo: Undo sends the previous values with If-Match and a fresh key", async () => {
  const app = launch();
  let reloads = 0;
  app.undo.editWithUndo({ path: `/goals/${ID}`, previous: { name: "Bike", target: 500_000 }, saved: SAVED, message: "Bike fund updated", reload: async () => { reloads++; } });
  assert.deepEqual(app.toasts.map((x) => [x.tone, x.message, x.action?.label]), [["success", "Bike fund updated", "Undo"]]);
  app.toasts[0].action!.onPress();
  await settle();
  assert.deepEqual(app.sent.map((s) => [s.method, s.path, s.body, s.ifMatch, typeof s.key]), [["PATCH", `/goals/${ID}`, { name: "Bike", target: 500_000 }, SAVED.updatedAt, "string"]]);
  assert.equal(reloads, 1);
  assert.deepEqual(app.toasts.at(-1), { tone: "info", message: UNDO_COPY.undone });
});

test("editWithUndo: changed since is refused and says so; nothing reloads", async () => {
  const app = launch({ answer: async () => { throw new ApiError(UNDO_COPY.changed, 409, "7K2QXB", { code: "conflict", reason: UNDO_COPY.changed }); } });
  let reloads = 0;
  app.undo.editWithUndo({ path: `/bills/${ID}`, previous: { amount: 1 }, saved: SAVED, message: "Rent updated", reload: async () => { reloads++; } });
  app.toasts[0].action!.onPress();
  await settle();
  assert.equal(reloads, 0);
  assert.deepEqual(app.toasts.at(-1), { tone: "error", message: UNDO_COPY.changed });
});

test("editWithUndo: offline at the tap sends nothing", async () => {
  const app = launch({ offline: true });
  app.undo.editWithUndo({ path: `/goals/${ID}`, previous: { name: "Bike" }, saved: SAVED, message: "Saved" });
  app.toasts[0].action!.onPress();
  await settle();
  assert.deepEqual(app.sent, []);
  assert.deepEqual(app.toasts.at(-1), { tone: "error", message: UNDO_COPY.offline });
});

test("editWithUndo: no updatedAt to send means a plain toast, with no Undo", () => {
  const app = launch();
  app.undo.editWithUndo({ path: `/goals/${ID}`, previous: {}, saved: null, message: "Saved" });
  app.undo.editWithUndo({ path: `/goals/${ID}`, previous: {}, saved: {}, message: "Saved", tone: "warning" });
  assert.deepEqual(app.toasts, [{ tone: "success", message: "Saved" }, { tone: "warning", message: "Saved" }]);
});

test("undoOutcome reads each answer", () => {
  assert.equal(undoOutcome(null), "undone");
  assert.equal(undoOutcome(offlineError(null)), "offline");
  assert.equal(undoOutcome(new ApiError(UNDO_COPY.changed, 409, null, { code: "conflict", reason: UNDO_COPY.changed })), "changed");
  assert.equal(undoOutcome(new ApiError("This trip is closed. Reopen it to make changes", 409, null, { code: "conflict" })), "failed");
  assert.equal(undoOutcome(new Error("x")), "failed");
});

test("previousValues: the old value of each key the save sent, blanks for what the record lacked", () => {
  const before = { _id: "x", title: "Zepto", amount: 45_000, category: "c1", occurredAt: "2026-11-14T10:00:00.000Z", updatedAt: "t" };
  const sent = { title: "Zepto 2", amount: 50_000, category: "c1", occurredAt: "2026-11-14T10:00:00.000Z", note: "late", paymentMode: "upi" };
  assert.deepEqual(previousValues(before, sent, { note: "", location: "" }), {
    title: "Zepto", amount: 45_000, category: "c1", occurredAt: "2026-11-14T10:00:00.000Z", note: "",
  });
  // null is a value: a cleared deadline goes back to null, not left out.
  assert.deepEqual(previousValues({ deadline: null }, { deadline: "2026-12-01T00:00:00.000Z" }), { deadline: null });
});
