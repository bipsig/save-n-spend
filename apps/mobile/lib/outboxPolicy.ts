// What the offline queue does with each answer, decided by the error's `code` rather than its
// wording. Pure, so it's tested under node (lib/outboxPolicy.test.ts).
import type { ApiErrorCode } from "@save-n-spend/types";
import { ApiError } from "./apiError";

export type OutboxDecision =
  | { kind: "synced" }
  /** Leave the item queued and try the queue again after `delayMs`. `wait` is set when the
   *  server named the wait (Retry-After), so nothing may send sooner. */
  | { kind: "retry"; delayMs: number; wait: boolean }
  /** Signed out: leave the queue exactly as it is. */
  | { kind: "stop" }
  | { kind: "failed"; message: string; code: ApiErrorCode | null };

const RETRY: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>(["rate_limited", "idempotency_in_progress", "internal"]);
const FAIL: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>([
  "invalid_input", "invalid_json", "invalid_reference", "not_found", "duplicate", "conflict", "idempotency_mismatch",
]);

const MAX_BACKOFF_MS = 5 * 60_000;

/** 2 s, 4 s, 8 s … up to five minutes. `attempt` counts from 1. */
export const backoffMs = (attempt: number): number => Math.min(MAX_BACKOFF_MS, 2_000 * 2 ** Math.max(0, attempt - 1));

export const decide = (err: unknown, attempt: number): OutboxDecision => {
  // Not a request failure (a bug); stop rather than mark a good item failed.
  if (!(err instanceof ApiError)) return { kind: "stop" };
  if (err.status === 401) return { kind: "stop" };

  const retry = (): OutboxDecision => ({
    kind: "retry",
    delayMs: Math.max(backoffMs(attempt), err.retryAfterMs ?? 0),
    wait: err.retryAfterMs !== null,
  });
  const failed = (): OutboxDecision => ({ kind: "failed", message: err.message, code: err.code });

  // No answer, a gateway page, an empty or garbled body: the API never said no.
  if (err.status === 0 || err.unreadable) return retry();
  if (err.code && RETRY.has(err.code)) return retry();
  if (err.code && FAIL.has(err.code)) return failed();
  if (err.code === null) {
    // An API without codes (2.6.0's, if the server is rolled back): its only 409 on this
    // route is "this clientId is already saved".
    if (err.status === 409) return { kind: "synced" };
    if (err.status === 429) return retry();
  }
  if (err.status >= 500) return retry();
  return failed();
};
