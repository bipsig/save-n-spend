import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApiErrorCode } from "@save-n-spend/types";
import { errorFromResponse, offlineError } from "./apiError";
import {
  deleteRequestFor, outcomeOf, replayDeletes, withItem, withoutKey,
  type PersistedDelete, type ReplayRequest,
} from "./pendingDeleteReplay";

// Run from apps/api: node --require ts-node/register --test ../mobile/lib/pendingDeleteReplay.test.ts

const ID = "6a76f00dc0ffee0000c688aa";
const apiError = (status: number, code: ApiErrorCode | undefined) =>
  errorFromResponse(status, JSON.stringify({ success: false, statusCode: status, code, message: "Plain sentence", data: null }), {}, "7K2QXB");

const item = (key: string, over: Partial<PersistedDelete> = {}): PersistedDelete => ({
  key, label: key, idempotencyKey: `idem-${key}`, requests: [deleteRequestFor(key)!], at: 1, ...over,
});

const harness = (answers: (null | Error)[]) => {
  const sent: { request: ReplayRequest; key?: string }[] = [];
  const removed: string[] = [];
  return {
    sent,
    removed,
    deps: {
      send: async (request: ReplayRequest, key?: string) => {
        sent.push({ request, key });
        const answer = request.method === "DELETE" ? answers.shift() ?? null : null;
        if (answer) throw answer;
      },
      remove: async (key: string) => { removed.push(key); },
    },
  };
};

test("every key the screens schedule with maps to its DELETE", () => {
  assert.deepEqual(deleteRequestFor(`transaction:${ID}`), { method: "DELETE", path: `/transactions/${ID}` });
  assert.deepEqual(deleteRequestFor(`goal:${ID}`), { method: "DELETE", path: `/goals/${ID}` });
  assert.deepEqual(deleteRequestFor(`bill:${ID}`), { method: "DELETE", path: `/bills/${ID}` });
  assert.deepEqual(deleteRequestFor(`category:${ID}`), { method: "DELETE", path: `/categories/${ID}` });
  assert.deepEqual(deleteRequestFor(`account:${ID}`), { method: "DELETE", path: `/accounts/${ID}` });
  assert.equal(deleteRequestFor(`trip:${ID}`), null);
  assert.equal(deleteRequestFor(`transaction:${ID}/x`), null);
  assert.equal(deleteRequestFor("nonsense"), null);
});

test("adding replaces the same key; removing drops only it", () => {
  const a = item(`bill:${ID}`);
  const b = item(`goal:${ID}`);
  const a2 = { ...a, at: 2 };
  assert.deepEqual(withItem(withItem([a, b], a2), b).map((i) => [i.key, i.at]), [[a.key, 2], [b.key, 1]]);
  assert.deepEqual(withoutKey([a, b], a.key), [b]);
});

test("a delete killed in its undo window is sent on replay with its own key, then dropped", async () => {
  const h = harness([null]);
  const result = await replayDeletes([item(`transaction:${ID}`)], h.deps);
  assert.deepEqual(h.sent, [{ request: { method: "DELETE", path: `/transactions/${ID}` }, key: `idem-transaction:${ID}` }]);
  assert.deepEqual(h.removed, [`transaction:${ID}`]);
  assert.equal(result.done.length, 1);
});

test("a resend of a delete that already landed is done, not an error", async () => {
  const h = harness([apiError(404, "not_found")]);
  const result = await replayDeletes([item(`goal:${ID}`)], h.deps);
  assert.equal(result.done.length, 1);
  assert.equal(result.refused.length, 0);
  assert.deepEqual(h.removed, [`goal:${ID}`]);
  assert.equal(outcomeOf(apiError(404, undefined)), "done");
});

test("no connection, a gateway page or a busy key stay on disk for next time", async () => {
  for (const err of [offlineError(null), errorFromResponse(502, "<html></html>", {}, null), apiError(409, "idempotency_in_progress"), apiError(429, "rate_limited")]) {
    const h = harness([err]);
    const result = await replayDeletes([item(`bill:${ID}`)], h.deps);
    assert.equal(result.kept.length, 1, err.message);
    assert.deepEqual(h.removed, []);
  }
});

test("a refusal is dropped and reported, and the rest still go", async () => {
  const h = harness([apiError(409, "conflict"), null]);
  const result = await replayDeletes([item(`transaction:${ID}`), item(`bill:${ID}`)], h.deps);
  assert.equal(result.refused.length, 1);
  assert.equal(result.refused[0].item.key, `transaction:${ID}`);
  assert.equal(result.done.length, 1);
  assert.deepEqual(h.removed, [`transaction:${ID}`, `bill:${ID}`]);
});

test("signed out mid-replay: everything left stays on disk", async () => {
  const h = harness([apiError(401, "unauthenticated")]);
  const result = await replayDeletes([item(`goal:${ID}`), item(`bill:${ID}`)], h.deps);
  assert.equal(result.kept.length, 2);
  assert.equal(h.sent.length, 1);
  assert.deepEqual(h.removed, []);
});

test("follow-up requests go only after the DELETE lands, without the delete's key", async () => {
  const clearDefault: ReplayRequest = { method: "PATCH", path: "/users/me", body: { prefs: { defaultAccount: null } } };
  const withAfter = item(`account:${ID}`, { requests: [deleteRequestFor(`account:${ID}`)!, clearDefault] });

  const ok = harness([null]);
  await replayDeletes([withAfter], ok.deps);
  assert.deepEqual(ok.sent.map((s) => [s.request.method, s.key]), [["DELETE", `idem-account:${ID}`], ["PATCH", undefined]]);

  const offline = harness([offlineError(null)]);
  await replayDeletes([withAfter], offline.deps);
  assert.deepEqual(offline.sent.map((s) => s.request.method), ["DELETE"]);
});
