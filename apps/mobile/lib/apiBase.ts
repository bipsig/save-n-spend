// Pure constants, split out of lib/api.ts so store/connectivity.ts can read the health
// URL without importing api.ts itself — api.ts imports connectivity to report
// reachability, and that import would otherwise cycle.
import Constants from "expo-constants";

// Explicit override wins; otherwise derive the host Metro serves from (your
// laptop's LAN IP in Expo Go) and hit the API on :3000.
const resolveBaseUrl = (): string => {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return host ? `http://${host}:7019/api/v1` : "http://localhost:7019/api/v1";
};

export const BASE_URL = resolveBaseUrl();

/** The liveness probe, used by the cold-start gate and the offline recheck loop.
 *
 *  Built from BASE_URL with the version prefix stripped, because `GET /health` is the
 *  one route mounted outside `/api/v1` — deriving it here keeps the two from drifting
 *  apart when the deployed URL changes. */
export const HEALTH_URL = `${BASE_URL.replace(/\/api\/v1\/?$/, "")}/health`;
