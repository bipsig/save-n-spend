// A tiny fetch wrapper — same shape as a MERN `api.js`, with two RN adaptations:
//   • the token comes from our in-memory session store, not localStorage
//     (React Native has no localStorage). The store is hydrated from SecureStore
//     on boot, so this read is synchronous — the closest 1:1 to localStorage.
//   • BASE_URL is the dev machine's LAN IP: on a phone, localhost is the phone.
import Constants from "expo-constants";
import { useSession } from "@/store/session";

// Explicit override wins; otherwise derive the host Metro serves from (your
// laptop's LAN IP in Expo Go) and hit the API on :3000.
const resolveBaseUrl = (): string => {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return host ? `http://${host}:7019/api/v1` : "http://localhost:7019/api/v1";
};

const BASE_URL = resolveBaseUrl();

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";


const request = async <T>(method: Method, path: string, body?: unknown): Promise<T> => {
  const token = useSession.getState().token; // ← the RN swap for localStorage.getItem

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const json = await res.json();

  if (!res.ok) {
    // Token rejected anywhere but the auth routes → drop the session (gate → login).
    if (res.status === 401 && !path.includes("/auth/")) {
      useSession.getState().signOut();
    }
    throw new Error(json.message || `Request failed: ${res.status}`);
  }

  return json.data as T; // unwrap the { success, message, data } envelope
};

// Pass a type to get a typed result: post<{ accessToken: string }>("/auth/login", v).
export const get = <T>(path: string) => request<T>("GET", path);
export const post = <T>(path: string, body?: unknown) => request<T>("POST", path, body);
export const put = <T>(path: string, body?: unknown) => request<T>("PUT", path, body);
export const patch = <T>(path: string, body?: unknown) => request<T>("PATCH", path, body);
export const del = <T>(path: string) => request<T>("DELETE", path);
