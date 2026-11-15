import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApiErrorCode } from "@save-n-spend/types";
import type { OutboxItem } from "./outbox";
import { errorFromResponse, offlineError } from "./apiError";
import { drainQueue } from "./outboxDrain";

// Run from apps/api: node --require ts-node/register --test ../mobile/lib/outboxDrain.test.ts

const refusal = (status: number, code: ApiErrorCode, retryAfter?: string) =>
  errorFromResponse(status, JSON.stringify({ success: false, statusCode: status, code, message: "Plain sentence", data: null }), { retryAfter }, "7K2QXB");

// A 2.6.0 outbox file: no idempotencyKey, the clientId only in the item and its body.
const legacy = (clientId: string): OutboxItem => ({
  clientId,
  payload: { type: "expense", amount: 10000, account: "a1", category: "c1", title: "Tea", occurredAt: "2026-11-01T10:00:00.000Z", clientId },
  createdAt: 1,
  status: "queued",
});

type Answer = "ok" | Error;

/** An in-memory queue; `answers` are what the server says to each send in turn. */
const harness = (items: OutboxItem[], answers: Answer[], attempt = 0) => {
  let state = items.map((i) => ({ ...i }));
  const saved: OutboxItem[][] = [];
  const sent: { clientId: string; key: string; body: Record<string, unknown> }[] = [];
  let keys = 0;
  const deps = {
    items: () => state,
    update: (fn: (i: OutboxItem[]) => OutboxItem[]) => { state = fn(state); },
    save: async () => { saved.push(state.map((i) => ({ ...i }))); },
    send: async (item: OutboxItem, key: string) => {
      sent.push({ clientId: item.clientId, key, body: item.payload });
      const answer = answers.shift() ?? "ok";
      if (answer !== "ok") throw answer;
    },
    makeKey: () => `made-${++keys}`,
    attempt,
  };
  return { deps, sent, saved, state: () => state };
};

test("an item queued by 2.6.0 gets a key once, stored before it is first sent, and drains", async () => {
  const h = harness([legacy("old-1")], ["ok"]);
  const result = await drainQueue(h.deps);
  assert.equal(result.synced, 1);
  assert.deepEqual(h.state(), []);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].key, "made-1");
  // The body clientId is untouched, so the server still dedupes on it.
  assert.equal(h.sent[0].body.clientId, "old-1");
  assert.equal(h.saved[0][0].idempotencyKey, "made-1");
});

test("a 2.6.0 item keeps the same key across a retry and a restart", async () => {
  const h = harness([legacy("old-1")], [offlineError(null)]);
  const first = await drainQueue(h.deps);
  assert.equal(first.synced, 0);
  assert.ok(first.retry);
  assert.equal(first.attempt, 1);
  assert.equal(h.state()[0].status, "queued");
  assert.equal(h.state()[0].idempotencyKey, "made-1");

  // What was saved is what the next launch reads.
  const restarted = harness(h.saved[h.saved.length - 1], ["ok"], first.attempt);
  const second = await drainQueue(restarted.deps);
  assert.equal(second.synced, 1);
  assert.equal(second.attempt, 0);
  assert.equal(restarted.sent[0].key, "made-1");
});

test("a 2.6.0 item the server already has (the old 409) counts as synced", async () => {
  const oldApi = errorFromResponse(409, JSON.stringify({ success: false, message: "A record with this value already exists" }), {}, "A");
  const h = harness([legacy("old-1"), legacy("old-2")], [oldApi, "ok"]);
  const result = await drainQueue(h.deps);
  assert.equal(result.synced, 2);
  assert.deepEqual(h.state(), []);
});

test("a new item sends the key it was queued with", async () => {
  const item: OutboxItem = { ...legacy("k1"), idempotencyKey: "k1" };
  const h = harness([item], ["ok"]);
  await drainQueue(h.deps);
  assert.equal(h.sent[0].key, "k1");
  assert.equal(h.saved.length, 1); // only the removal; no key had to be made
});

test("a refusal marks that item failed and the queue carries on", async () => {
  const h = harness([legacy("bad"), legacy("good")], [refusal(400, "invalid_reference"), "ok"]);
  const result = await drainQueue(h.deps);
  assert.equal(result.synced, 1);
  assert.equal(result.retry, null);
  assert.deepEqual(h.state().map((i) => [i.clientId, i.status, i.errorCode, i.error]), [["bad", "failed", "invalid_reference", "Plain sentence · Ref 7K2QXB"]]);
});

test("a retryable answer stops the queue in order and passes the wait on", async () => {
  const h = harness([legacy("first"), legacy("second")], [refusal(429, "rate_limited", "60")]);
  const result = await drainQueue(h.deps);
  assert.deepEqual(result.retry, { delayMs: 60_000, wait: true });
  assert.equal(h.sent.length, 1);
  assert.deepEqual(h.state().map((i) => i.status), ["queued", "queued"]);
});

test("a gateway page and idempotency_in_progress leave the item queued", async () => {
  for (const err of [errorFromResponse(502, "<html></html>", {}, "A"), refusal(409, "idempotency_in_progress", "1")]) {
    const h = harness([legacy("x")], [err]);
    const result = await drainQueue(h.deps);
    assert.ok(result.retry, err.message);
    assert.equal(h.state()[0].status, "queued");
  }
});

test("a 401 stops without touching anything", async () => {
  const h = harness([legacy("x")], [refusal(401, "unauthenticated")]);
  const result = await drainQueue(h.deps);
  assert.deepEqual(result, { synced: 0, retry: null, attempt: 0 });
  assert.equal(h.state()[0].status, "queued");
});

test("failed items are skipped; only queued ones are sent", async () => {
  const failed: OutboxItem = { ...legacy("f"), status: "failed", error: "x" };
  const h = harness([failed, legacy("q")], ["ok"]);
  await drainQueue(h.deps);
  assert.deepEqual(h.sent.map((s) => s.clientId), ["q"]);
  assert.deepEqual(h.state().map((i) => i.clientId), ["f"]);
});

test("a mixed queue goes out in order, each item with its own key on every try", async () => {
  const keyed = (clientId: string): OutboxItem => ({ ...legacy(clientId), idempotencyKey: `key-${clientId}` });
  const queue = [legacy("a"), keyed("b"), legacy("c"), keyed("d")];
  // a lands, b is refused, c finds no connection: d waits behind c.
  const h = harness(queue, ["ok", refusal(400, "invalid_input"), offlineError(null)]);
  const first = await drainQueue(h.deps);
  assert.deepEqual(h.sent.map((s) => [s.clientId, s.key]), [["a", "made-1"], ["b", "key-b"], ["c", "made-2"]]);
  assert.deepEqual(h.state().map((i) => [i.clientId, i.status]), [["b", "failed"], ["c", "queued"], ["d", "queued"]]);

  const restarted = harness(h.saved[h.saved.length - 1], ["ok", "ok"], first.attempt);
  const second = await drainQueue(restarted.deps);
  assert.equal(second.synced, 2);
  assert.deepEqual(restarted.sent.map((s) => [s.clientId, s.key]), [["c", "made-2"], ["d", "key-d"]]);
  assert.deepEqual(restarted.state().map((i) => i.clientId), ["b"]);
});
