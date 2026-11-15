// A tiny fetch wrapper — same shape as a MERN `api.js`, with two RN adaptations:
//   • the token comes from our in-memory session store, not localStorage
//     (React Native has no localStorage). The store is hydrated from SecureStore
//     on boot, so this read is synchronous — the closest 1:1 to localStorage.
//   • BASE_URL is the dev machine's LAN IP: on a phone, localhost is the phone.
import { useSession } from "@/store/session";
import { useConnectivity } from "@/store/connectivity";
import * as offlineCache from "@/lib/offlineCache";
import { BASE_URL } from "@/lib/apiBase";
import { makeRequestId, routePattern } from "@/lib/requestId";
import { APP_VERSION } from "@/lib/errorReporting";
import { useRequestLog } from "@/store/requestLog";
import { ApiError, errorFromResponse, offlineError, readSuccessBody } from "@/lib/apiError";

// Re-exported so store/wake.ts's existing import path is untouched — BASE_URL/HEALTH_URL
// moved to lib/apiBase.ts so store/connectivity.ts (imported below) can read HEALTH_URL
// without importing this file, which would cycle.
export { HEALTH_URL } from "@/lib/apiBase";
export { ApiError };

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RequestOptions = {
  /** Same key on every retry of one intent; the server answers a repeat with the first reply.
   *  See lib/idempotency.ts. */
  idempotencyKey?: string;
  /** False for exports: a file must come from the server, so a GET neither answers from nor
   *  writes to the offline cache, and fails as offline when nothing answers. */
  cache?: boolean;
};

const request = async <T>(method: Method, path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> => {
  const token = useSession.getState().token; // ← the RN swap for localStorage.getItem

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
  const unanswered = async (): Promise<T> => {
    useConnectivity.getState().reportOffline();
    record(0, "No response");
    // A GET has a fallback a write does not: its last-known answer. Every hook renders
    // this exactly as if the request had succeeded — no per-hook offline handling.
    if (cacheable) {
      const cached = await offlineCache.read<T>(path);
      if (cached) return cached.data;
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
    record(res.status);
    if (cacheable) void offlineCache.write(path, parsed.data);
    return parsed.data as T; // unwrap the { success, message, data } envelope
  }

  // Any answer at all — even a rejection — proves the server is reachable.
  useConnectivity.getState().reportOnline();

  // Token rejected anywhere but the auth routes → drop the session (gate → login).
  if (res.status === 401 && !path.includes("/auth/")) {
    useSession.getState().signOut();
  }
  const err = errorFromResponse(res.status, text, { retryAfter: res.headers.get("Retry-After") }, requestId);
  record(res.status, err.reason);
  throw err;
};

// Pass a type to get a typed result: post<{ accessToken: string }>("/auth/login", v).
export const get = <T>(path: string, opts?: RequestOptions) => request<T>("GET", path, undefined, opts);
export const post = <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("POST", path, body, opts);
export const put = <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("PUT", path, body, opts);
export const patch = <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("PATCH", path, body, opts);
export const del = <T>(path: string, opts?: RequestOptions) => request<T>("DELETE", path, undefined, opts);
