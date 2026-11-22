// A tiny fetch wrapper — same shape as a MERN `api.js`, with two RN adaptations:
//   • the token comes from our in-memory session store, not localStorage
//     (React Native has no localStorage). The store is hydrated from SecureStore
//     on boot, so this read is synchronous — the closest 1:1 to localStorage.
//   • BASE_URL is the dev machine's LAN IP: on a phone, localhost is the phone.
import { create } from "zustand";
import { useSession } from "@/store/session";
import { useConnectivity } from "@/store/connectivity";
import * as offlineCache from "@/lib/offlineCache";
import { offlineData, offlinePath } from "@/lib/offlineSlot";
import { tokenOwner } from "@/lib/cacheOwner";
import { BASE_URL, HEALTH_URL } from "@/lib/apiBase";
import { makeRequestId, routePattern } from "@/lib/requestId";
import { APP_VERSION } from "@/lib/errorReporting";
import { useRequestLog } from "@/store/requestLog";
import { ApiError, WAKING_MESSAGE, errorFromResponse, offlineError, readSuccessBody } from "@/lib/apiError";
import { afterWrite } from "@/lib/query/invalidate";

// Re-exported so store/wake.ts's existing import path is untouched — BASE_URL/HEALTH_URL
// moved to lib/apiBase.ts so store/connectivity.ts (imported below) can read HEALTH_URL
// without importing this file, which would cycle.
export { HEALTH_URL } from "@/lib/apiBase";
export { ApiError };

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** True while Render is waking: a read answered 502/503/504 or a gateway page, was given its
 *  saved copy, and the server is being retried. ServerWakingStrip shows it. */
export const useServerWaking = create<{ waking: boolean }>(() => ({ waking: false }));

/** Calls `listener` each time the server answers after waking, so a screen showing saved
 *  data can refetch. Returns the unsubscribe: `useEffect(() => onServerAwake(refetch), [refetch])`. */
export const onServerAwake = (listener: () => void): (() => void) =>
  useServerWaking.subscribe((state, prev) => {
    if (prev.waking && !state.waking) listener();
  });

const setWaking = (waking: boolean) => {
  if (useServerWaking.getState().waking !== waking) useServerWaking.setState({ waking });
};

/** Gaps between retries while waking; the last repeats. Not tighter: each one is a request
 *  to an instance that is still booting. */
export const WAKE_RETRY_MS = [2_000, 4_000, 8_000, 15_000, 30_000];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Module-level machinery, as in store/wake.ts: one retry loop however many reads were waiting.
let wakeRetry: Promise<void> | null = null;

const retryUntilAwake = (): Promise<void> => (wakeRetry ??= (async () => {
  try {
    for (let attempt = 0; useServerWaking.getState().waking; attempt++) {
      await sleep(WAKE_RETRY_MS[Math.min(attempt, WAKE_RETRY_MS.length - 1)]);
      if (!useServerWaking.getState().waking) return; // another request already got an answer
      try {
        const res = await fetch(HEALTH_URL, { method: "GET" });
        const text = await res.text();
        if (res.ok ? readSuccessBody(text).ok : !isWakingReply(errorFromResponse(res.status, text, {}, null))) {
          setWaking(false);
        }
      }
      catch {
        // No answer yet; the next gap is longer.
      }
    }
  }
  finally {
    wakeRetry = null;
  }
})());

/** The gateway's reply while an instance boots, not the API's own error. */
const isWakingReply = (err: ApiError): boolean => err.unreadable && err.reason === WAKING_MESSAGE;

export type RequestOptions = {
  /** Same key on every retry of one intent; the server answers a repeat with the first reply.
   *  See lib/idempotency.ts. */
  idempotencyKey?: string;
  /** False for exports: a file must come from the server, so a GET neither answers from nor
   *  writes to the offline cache, and fails as offline when nothing answers. */
  cache?: boolean;
  /** False when the caller refreshes the screens itself once a batch is done (the outbox). */
  invalidate?: boolean;
  /** Sent as `If-Match`: the `updatedAt` an edit's save got back, so an undo is refused (409
   *  `conflict`) when the record changed since. */
  ifMatch?: string;
};

/** What a read returns with its data: when that data was fetched. A saved copy carries the
 *  time it was saved, not the time it was read back. */
export type Fetched<T> = { data: T; fetchedAt: number };

const request = async <T>(method: Method, path: string, body?: unknown, opts: RequestOptions = {}): Promise<Fetched<T>> => {
  const token = useSession.getState().token; // ← the RN swap for localStorage.getItem
  // Saved copies are read and written for the user this request is sent as, never another.
  const owner = tokenOwner(token);

  // One reference per call, sent to the server (which logs under it) and kept on the phone —
  // so the "Ref 7K2QXB" in an error message finds the same request on both sides.
  const requestId = makeRequestId();
  const started = Date.now();
  const record = (status: number, message?: string) =>
    useRequestLog.getState().add({
      requestId,
      method,
      route: routePattern(path),
      status,
      durationMs: Date.now() - started,
      at: new Date(started).toISOString(),
      ...(message ? { message } : {}),
    });

  const cacheable = method === "GET" && opts.cache !== false;

  // Nothing (usable) came back, so there is no status and nothing about the token is in
  // question. Status 0 is how a caller tells this apart from a rejection.
  const unanswered = async (): Promise<Fetched<T>> => {
    useConnectivity.getState().reportOffline();
    setWaking(false); // the offline banner says it better
    record(0, "No response");
    // A GET has a fallback a write does not: its last-known answer. Every hook renders
    // this exactly as if the request had succeeded — no per-hook offline handling.
    if (cacheable) {
      const cached = await offlineCache.read<T>(offlinePath(path), owner);
      if (cached) return cached;
    }
    throw offlineError(requestId);
  };

  let res: Response;
  let text: string;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
        "X-App-Version": APP_VERSION,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
        ...(opts.ifMatch ? { "If-Match": opts.ifMatch } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    text = await res.text();
  }
  catch {
    return unanswered();
  }

  if (res.ok) {
    const parsed = readSuccessBody(text);
    if (!parsed.ok) return unanswered();
    useConnectivity.getState().reportOnline();
    setWaking(false);
    record(res.status);
    if (cacheable) void offlineCache.write(offlinePath(path), offlineData(path, parsed.data), owner);
    if (method !== "GET" && opts.invalidate !== false) afterWrite(path, body);
    return { data: parsed.data as T, fetchedAt: Date.now() }; // unwrap the { success, message, data } envelope
  }

  // Any answer at all — even a rejection — proves the server is reachable.
  useConnectivity.getState().reportOnline();

  // Token rejected anywhere but the auth routes → drop the session (gate → login).
  if (res.status === 401 && !path.includes("/auth/")) {
    useSession.getState().signOut();
  }
  const err = errorFromResponse(res.status, text, { retryAfter: res.headers.get("Retry-After") }, requestId);
  record(res.status, err.reason);

  // Render waking up (D19): a read shows its saved copy while this keeps asking. Exports
  // (`cache: false`) and writes still fail; the outbox handles writes.
  if (!isWakingReply(err)) setWaking(false);
  else if (cacheable) {
    const cached = await offlineCache.read<T>(offlinePath(path), owner);
    if (cached) {
      setWaking(true);
      void retryUntilAwake();
      return cached;
    }
  }
  throw err;
};

const dataOf = <T>(fetched: Promise<Fetched<T>>): Promise<T> => fetched.then((r) => r.data);

// Pass a type to get a typed result: post<{ accessToken: string }>("/auth/login", v).
export const get = <T>(path: string, opts?: RequestOptions) => dataOf(request<T>("GET", path, undefined, opts));
/** `get` plus when its data was fetched; what lib/query reads through. */
export const getFetched = <T>(path: string) => request<T>("GET", path);
export const post = <T>(path: string, body?: unknown, opts?: RequestOptions) => dataOf(request<T>("POST", path, body, opts));
export const put = <T>(path: string, body?: unknown, opts?: RequestOptions) => dataOf(request<T>("PUT", path, body, opts));
export const patch = <T>(path: string, body?: unknown, opts?: RequestOptions) => dataOf(request<T>("PATCH", path, body, opts));
export const del = <T>(path: string, opts?: RequestOptions) => dataOf(request<T>("DELETE", path, undefined, opts));
