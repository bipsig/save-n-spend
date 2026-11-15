// What a failed request turns into. Kept free of React Native and the `@/` alias so the
// parsing can be tested under node (see lib/apiError.test.ts); lib/api.ts re-exports it.
import type { ApiErrorCode, ApiIssue } from "@save-n-spend/types";

export const OFFLINE_MESSAGE = "Couldn't reach the server, so check your connection and try again";
/** Render's free tier answers 502/503/504 or its own HTML page while an instance boots. */
export const WAKING_MESSAGE = "The server is starting up, so try again in a minute";
export const UNREADABLE_MESSAGE = "Something went wrong, so try again in a moment";

type Details = {
  code?: ApiErrorCode | null;
  issues?: ApiIssue[];
  retryAfterMs?: number | null;
  unreadable?: boolean;
  reason?: string;
};

/**
 * A failed request, with the status the server answered with — or `0` when it never
 * answered at all: a timeout, no signal, an instance still booting.
 *
 * Load-bearing, not cosmetic: a token is only ever wrong because a server *said* so, so
 * "rejected" and "unanswered" must not reach a caller as the same value — conflating them ends
 * a session every time the API is merely asleep. See the boot flow in app/_layout.
 */
export class ApiError extends Error {
  readonly status: number;
  /** The request's reference — the one in the server log and the Diagnostics list. */
  readonly requestId: string | null;
  /** Null when the answer had none: an older API, a gateway page, no answer. */
  readonly code: ApiErrorCode | null;
  readonly issues: ApiIssue[];
  readonly retryAfterMs: number | null;
  /** The answer wasn't the API's JSON: a gateway page, an empty or garbled body. */
  readonly unreadable: boolean;
  /** `message` without the " · Ref" suffix. */
  readonly reason: string;

  constructor(message: string, status: number, requestId: string | null = null, details: Details = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.requestId = requestId;
    this.code = details.code ?? null;
    this.issues = details.issues ?? [];
    this.retryAfterMs = details.retryAfterMs ?? null;
    this.unreadable = details.unreadable ?? false;
    this.reason = details.reason ?? message;
  }
}

/** Retry-After is either whole seconds or an HTTP date. */
export const parseRetryAfter = (value: string | null | undefined, now = Date.now()): number | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
};

const isIssue = (v: unknown): v is ApiIssue =>
  !!v && typeof (v as ApiIssue).path === "string" && typeof (v as ApiIssue).message === "string";

/** Parses an error JSON body if there is one; null for an empty, HTML or garbled body. */
const readEnvelope = (text: string): { message: string; code: ApiErrorCode | null; issues: ApiIssue[] } | null => {
  if (!text.trim()) return null;
  let body: unknown;
  try {
    body = JSON.parse(text);
  }
  catch {
    return null;
  }
  if (!body || typeof body !== "object") return null;
  const { message, code, issues } = body as { message?: unknown; code?: unknown; issues?: unknown };
  if (typeof message !== "string" || !message.trim()) return null;
  return {
    message,
    code: typeof code === "string" ? (code as ApiErrorCode) : null,
    issues: Array.isArray(issues) ? issues.filter(isIssue) : [],
  };
};

export const errorFromResponse = (
  status: number,
  text: string,
  headers: { retryAfter?: string | null },
  requestId: string | null,
): ApiError => {
  const retryAfterMs = parseRetryAfter(headers.retryAfter);
  const envelope = readEnvelope(text);
  const reason = envelope?.message
    ?? (status === 502 || status === 503 || status === 504 || /^\s*</.test(text) ? WAKING_MESSAGE : UNREADABLE_MESSAGE);
  // The reference rides on the message, so every screen that shows `err.message` shows it.
  const message = requestId ? `${reason} · Ref ${requestId}` : reason;
  return new ApiError(message, status, requestId, {
    code: envelope?.code ?? null,
    issues: envelope?.issues ?? [],
    retryAfterMs,
    unreadable: !envelope,
    reason,
  });
};

export const offlineError = (requestId: string | null): ApiError =>
  // No reference in the message: nothing reached the server to look up.
  new ApiError(OFFLINE_MESSAGE, 0, requestId, { unreadable: true });

/** A 2xx is the API's only when it's empty (data null) or JSON; anything else (a captive
 *  portal's page) never reached it, and must not count as saved. */
export const readSuccessBody = (text: string): { ok: true; data: unknown } | { ok: false } => {
  if (!text.trim()) return { ok: true, data: null };
  try {
    const json = JSON.parse(text) as { data?: unknown } | null;
    return { ok: true, data: json && typeof json === "object" ? json.data ?? null : null };
  }
  catch {
    return { ok: false };
  }
};

/**
 * Splits a failure into the messages a form can put on its own fields and the one to show
 * elsewhere. `fields` maps a server path (`amount`, `owedBy`) to the form's field name; a
 * path matches its own entry or any entry it starts with (`owedBy.1.amount` → `owedBy`).
 * `rest` is null when every issue found a field.
 */
export const splitIssues = <F extends string>(
  err: unknown,
  fields: Record<string, F>,
  fallback: string,
): { byField: Partial<Record<F, string>>; rest: string | null } => {
  if (!(err instanceof ApiError)) return { byField: {}, rest: err instanceof Error ? err.message : fallback };
  if (err.issues.length === 0) return { byField: {}, rest: err.message };

  const byField: Partial<Record<F, string>> = {};
  const left: ApiIssue[] = [];
  for (const issue of err.issues) {
    const match = Object.keys(fields).find((p) => issue.path === p || issue.path.startsWith(`${p}.`));
    const field = match ? fields[match] : undefined;
    if (field && byField[field] === undefined) byField[field] = issue.message;
    else if (!field) left.push(issue);
  }
  if (left.length === 0) return { byField, rest: null };
  const reason = left[0].message;
  return { byField, rest: err.requestId ? `${reason} · Ref ${err.requestId}` : reason };
};
