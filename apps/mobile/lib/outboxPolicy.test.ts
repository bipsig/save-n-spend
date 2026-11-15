import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApiErrorCode } from "@save-n-spend/types";
import { ApiError, errorFromResponse, offlineError } from "./apiError";
import { backoffMs, decide } from "./outboxPolicy";

// Run from apps/api: node --require ts-node/register --test ../mobile/lib/outboxPolicy.test.ts

const fromApi = (status: number, code: ApiErrorCode | undefined, retryAfter?: string) =>
  errorFromResponse(status, JSON.stringify({ success: false, statusCode: status, code, message: "Plain sentence", data: null }), { retryAfter }, "7K2QXB");

test("backoff doubles from 2 s and stops at five minutes", () => {
  assert.equal(backoffMs(1), 2_000);
  assert.equal(backoffMs(2), 4_000);
  assert.equal(backoffMs(5), 32_000);
  assert.equal(backoffMs(20), 300_000);
});

test("no answer, a gateway page and an empty body are retried", () => {
  for (const err of [
    offlineError("A"),
    errorFromResponse(502, "<html>Bad Gateway</html>", {}, "A"),
    errorFromResponse(503, "", {}, "A"),
    errorFromResponse(504, "upstream timed out", {}, "A"),
    errorFromResponse(400, "<html>proxy</html>", {}, "A"),
  ]) {
    const d = decide(err, 1);
    assert.equal(d.kind, "retry", err.message);
    if (d.kind === "retry") assert.equal(d.wait, false);
  }
});

test("rate_limited, idempotency_in_progress and internal are retried, honouring Retry-After", () => {
  const limited = decide(fromApi(429, "rate_limited", "90"), 1);
  assert.deepEqual(limited, { kind: "retry", delayMs: 90_000, wait: true });
  const busy = decide(fromApi(409, "idempotency_in_progress", "1"), 3);
  // The backoff is longer than the server's wait here, so the backoff wins.
  assert.deepEqual(busy, { kind: "retry", delayMs: 8_000, wait: true });
  assert.deepEqual(decide(fromApi(500, "internal"), 1), { kind: "retry", delayMs: 2_000, wait: false });
});

test("refusals mark the item failed with its message and code", () => {
  const codes: [number, ApiErrorCode][] = [
    [400, "invalid_input"], [400, "invalid_json"], [400, "invalid_reference"], [404, "not_found"],
    [409, "duplicate"], [409, "conflict"], [422, "idempotency_mismatch"],
  ];
  for (const [status, code] of codes) {
    assert.deepEqual(decide(fromApi(status, code), 1), { kind: "failed", message: "Plain sentence · Ref 7K2QXB", code }, code);
  }
});

test("a 401 leaves the queue alone; so does something that isn't a request failure", () => {
  assert.deepEqual(decide(fromApi(401, "unauthenticated"), 1), { kind: "stop" });
  assert.deepEqual(decide(new TypeError("bug"), 1), { kind: "stop" });
});

test("an API without codes: 409 is the saved clientId, 429 and 5xx retry, other 4xx fail", () => {
  assert.deepEqual(decide(fromApi(409, undefined), 1), { kind: "synced" });
  assert.equal(decide(fromApi(429, undefined), 1).kind, "retry");
  assert.equal(decide(fromApi(500, undefined), 1).kind, "retry");
  assert.equal(decide(fromApi(400, undefined), 1).kind, "failed");
});

test("a code this app doesn't know: 4xx fails, 5xx retries", () => {
  assert.equal(decide(fromApi(418, "something_new" as ApiErrorCode), 1).kind, "failed");
  assert.equal(decide(fromApi(503, "something_new" as ApiErrorCode), 1).kind, "retry");
  assert.equal(decide(new ApiError("x", 413, null, { code: "body_too_large" }), 1).kind, "failed");
});
