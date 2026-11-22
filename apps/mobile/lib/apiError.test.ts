import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ApiError, OFFLINE_MESSAGE, UNREADABLE_MESSAGE, WAKING_MESSAGE,
  errorFromResponse, errorText, offlineError, parseRetryAfter, readSuccessBody, splitIssues,
} from "./apiError";

// Run from apps/api: node --require ts-node/register --test ../mobile/lib/apiError.test.ts

const envelope = (over: Record<string, unknown> = {}) => JSON.stringify({
  success: false, statusCode: 400, code: "invalid_input", message: "Amount must be more than zero",
  issues: [{ path: "amount", message: "Amount must be more than zero" }], data: null, requestId: "7K2QXB", ...over,
});

test("the API's envelope keeps status, code, issues and the reference", () => {
  const err = errorFromResponse(400, envelope(), {}, "7K2QXB");
  assert.ok(err instanceof ApiError);
  assert.equal(err.status, 400);
  assert.equal(err.code, "invalid_input");
  assert.deepEqual(err.issues, [{ path: "amount", message: "Amount must be more than zero" }]);
  assert.equal(err.requestId, "7K2QXB");
  assert.equal(err.reason, "Amount must be more than zero");
  assert.equal(err.message, "Amount must be more than zero · Ref 7K2QXB");
  assert.equal(err.unreadable, false);
});

test("an older API's body without a code still shows its message", () => {
  const err = errorFromResponse(409, JSON.stringify({ success: false, message: "A record with this value already exists" }), {}, "AAAAAA");
  assert.equal(err.code, null);
  assert.deepEqual(err.issues, []);
  assert.equal(err.reason, "A record with this value already exists");
  assert.equal(err.unreadable, false);
});

test("malformed issues are dropped, good ones kept", () => {
  const err = errorFromResponse(400, envelope({ issues: [{ path: "name" }, "x", { path: "name", message: "Name can't be empty" }] }), {}, null);
  assert.deepEqual(err.issues, [{ path: "name", message: "Name can't be empty" }]);
  assert.equal(err.message, "Amount must be more than zero");
});

test("502, 503 and 504 without our body say the server is starting", () => {
  for (const status of [502, 503, 504]) {
    const err = errorFromResponse(status, "<html><body>Bad Gateway</body></html>", {}, "BBBBBB");
    assert.equal(err.status, status);
    assert.equal(err.reason, WAKING_MESSAGE);
    assert.equal(err.message, `${WAKING_MESSAGE} · Ref BBBBBB`);
    assert.equal(err.code, null);
    assert.equal(err.unreadable, true);
  }
  assert.equal(errorFromResponse(503, "", {}, null).reason, WAKING_MESSAGE);
});

test("an HTML page on any status reads as the server starting", () => {
  const err = errorFromResponse(404, "  <!DOCTYPE html><title>Service waking up</title>", {}, null);
  assert.equal(err.reason, WAKING_MESSAGE);
  assert.equal(err.unreadable, true);
});

test("an empty, garbled or message-less body gets the plain fallback", () => {
  for (const text of ["", "   ", "not json", "{\"success\":false", JSON.stringify({ success: false }), "null", "42"]) {
    const err = errorFromResponse(500, text, {}, null);
    assert.equal(err.reason, UNREADABLE_MESSAGE, text);
    assert.equal(err.unreadable, true, text);
  }
});

test("Retry-After in seconds or as a date", () => {
  const now = Date.parse("2026-11-15T08:00:00Z");
  assert.equal(parseRetryAfter("30", now), 30_000);
  assert.equal(parseRetryAfter(" 0 ", now), 0);
  assert.equal(parseRetryAfter("Sun, 15 Nov 2026 08:01:00 GMT", now), 60_000);
  assert.equal(parseRetryAfter("Sun, 15 Nov 2026 07:59:00 GMT", now), 0);
  assert.equal(parseRetryAfter("soon", now), null);
  assert.equal(parseRetryAfter(null, now), null);

  const limited = errorFromResponse(429, envelope({ code: "rate_limited", message: "Too many tries. Wait a few minutes and try again", issues: undefined }), { retryAfter: "120" }, null);
  assert.equal(limited.code, "rate_limited");
  assert.equal(limited.retryAfterMs, 120_000);
  const busy = errorFromResponse(409, envelope({ code: "idempotency_in_progress", message: "Still saving", issues: undefined }), { retryAfter: "2" }, null);
  assert.equal(busy.code, "idempotency_in_progress");
  assert.equal(busy.retryAfterMs, 2_000);
});

test("no answer is status 0 with no reference in the message", () => {
  const err = offlineError("CCCCCC");
  assert.equal(err.status, 0);
  assert.equal(err.message, OFFLINE_MESSAGE);
  assert.equal(err.requestId, "CCCCCC");
  assert.equal(err.unreadable, true);
});

test("a 2xx counts only when it is empty or JSON; empty is data null", () => {
  assert.deepEqual(readSuccessBody(JSON.stringify({ success: true, data: { _id: "a" } })), { ok: true, data: { _id: "a" } });
  assert.deepEqual(readSuccessBody(JSON.stringify({ success: true, data: null })), { ok: true, data: null });
  assert.deepEqual(readSuccessBody(JSON.stringify({ success: true })), { ok: true, data: null });
  assert.deepEqual(readSuccessBody(""), { ok: true, data: null });
  assert.deepEqual(readSuccessBody("  \n"), { ok: true, data: null });
  assert.deepEqual(readSuccessBody("<html>Sign in to the Wi-Fi</html>"), { ok: false });
});

test("the old constructor still works", () => {
  const err = new ApiError("Something", 418, "DDDDDD");
  assert.equal(err.status, 418);
  assert.equal(err.requestId, "DDDDDD");
  assert.equal(err.code, null);
  assert.deepEqual(err.issues, []);
  assert.equal(err.reason, "Something");
});

test("splitIssues puts issues on the form's fields and returns the rest", () => {
  const err = errorFromResponse(400, envelope({
    issues: [
      { path: "amount", message: "Amount must be more than zero" },
      { path: "owedBy.1.amount", message: "What each person owes must be more than zero" },
      { path: "occurredAt", message: "Date isn't a valid date" },
    ],
  }), {}, "EEEEEE");
  const { byField, rest } = splitIssues(err, { amount: "amount", owedBy: "split" } as const, "fallback");
  assert.deepEqual(byField, { amount: "Amount must be more than zero", split: "What each person owes must be more than zero" });
  assert.equal(rest, "Date isn't a valid date · Ref EEEEEE");
});

test("splitIssues: every issue placed means nothing else to show", () => {
  const err = errorFromResponse(400, envelope(), {}, "FFFFFF");
  assert.deepEqual(splitIssues(err, { amount: "amount" } as const, "fallback"), { byField: { amount: "Amount must be more than zero" }, rest: null });
});

test("splitIssues: no issues, another error, or not an error at all", () => {
  const conflict = errorFromResponse(409, envelope({ code: "conflict", message: "This trip is closed. Reopen it to make changes", issues: undefined }), {}, "GGGGGG");
  assert.deepEqual(splitIssues(conflict, { amount: "amount" } as const, "fallback"), { byField: {}, rest: "This trip is closed. Reopen it to make changes · Ref GGGGGG" });
  assert.deepEqual(splitIssues(new Error("boom"), {}, "fallback"), { byField: {}, rest: "boom" });
  assert.deepEqual(splitIssues("nope", {}, "fallback"), { byField: {}, rest: "fallback" });
  // A path that only shares a prefix with a field doesn't match it.
  const near = errorFromResponse(400, envelope({ issues: [{ path: "amountX", message: "Odd" }] }), {}, null);
  assert.deepEqual(splitIssues(near, { amount: "amount" } as const, "fallback"), { byField: {}, rest: "Odd" });
});

test("errorText: the caught message, or the fallback when there is none", () => {
  assert.equal(errorText(new Error("That trip is closed"), "Couldn't save it"), "That trip is closed");
  assert.equal(errorText(new Error(""), "Couldn't save it"), "Couldn't save it");
  assert.equal(errorText("nope", "Couldn't save it"), "Couldn't save it");
  assert.equal(errorText(undefined, "Couldn't save it"), "Couldn't save it");
});
