// A tiny fetch wrapper — same shape as a MERN `api.js`, with two RN adaptations:
//   • the token comes from our in-memory session store, not localStorage
//     (React Native has no localStorage). The store is hydrated from SecureStore
//     on boot, so this read is synchronous — the closest 1:1 to localStorage.
//   • BASE_URL is the dev machine's LAN IP: on a phone, localhost is the phone.
import { useSession } from "@/store/session";
import { useConnectivity } from "@/store/connectivity";
import * as offlineCache from "@/lib/offlineCache";
import { BASE_URL } from "@/lib/apiBase";

// Re-exported so store/wake.ts's existing import path is untouched — BASE_URL/HEALTH_URL
// moved to lib/apiBase.ts so store/connectivity.ts (imported below) can read HEALTH_URL
// without importing this file, which would cycle.
export { HEALTH_URL } from "@/lib/apiBase";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

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

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const request = async <T>(method: Method, path: string, body?: unknown): Promise<T> => {
  const token = useSession.getState().token; // ← the RN swap for localStorage.getItem

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }
  catch {
    // Nothing came back, so there is no status and nothing about the token is in
    // question. Status 0 is how a caller tells this apart from a rejection. The raw
    // fetch error (timeout, DNS, no route) is not useful to show, so it's dropped in
    // favor of one clean message every existing catch block in the app can display.
    useConnectivity.getState().reportOffline();
    // A GET has a fallback a write does not: its last-known answer. Every hook renders
    // this exactly as if the request had succeeded — no per-hook offline handling.
    if (method === "GET") {
      const cached = await offlineCache.read<T>(path);
      if (cached) return cached.data;
    }
    throw new ApiError("You're offline — check your connection", 0);
  }

  // Any answer at all — even a rejection — proves the server is reachable.
  useConnectivity.getState().reportOnline();

  if (!res.ok) {
    // Best-effort body: a gateway can answer with an HTML error page instead of our
    // envelope — Render does exactly that while an instance is coming up — and a parse
    // failure there must not bury the status, which is the useful part.
    const body = (await res.json().catch(() => null)) as { message?: string } | null;

    // Token rejected anywhere but the auth routes → drop the session (gate → login).
    if (res.status === 401 && !path.includes("/auth/")) {
      useSession.getState().signOut();
    }
    throw new ApiError(body?.message || `Request failed: ${res.status}`, res.status);
  }

  const json = await res.json();
  if (method === "GET") void offlineCache.write(path, json.data);
  return json.data as T; // unwrap the { success, message, data } envelope
};

// Pass a type to get a typed result: post<{ accessToken: string }>("/auth/login", v).
export const get = <T>(path: string) => request<T>("GET", path);
export const post = <T>(path: string, body?: unknown) => request<T>("POST", path, body);
export const put = <T>(path: string, body?: unknown) => request<T>("PUT", path, body);
export const patch = <T>(path: string, body?: unknown) => request<T>("PATCH", path, body);
export const del = <T>(path: string) => request<T>("DELETE", path);
