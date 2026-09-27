import Constants from "expo-constants";
import { BASE_URL } from "@/lib/apiBase";
import { makeRequestId } from "@/lib/requestId";
import { useSession } from "@/store/session";

// Sends errors that happen on the phone to the server's log, so a crash is a lookup rather
// than a guess. Fire-and-forget over a plain fetch — not lib/api's `request`, so a failing
// report can never report itself, or show up as an error the user has to see.

const APP_VERSION = Constants.expoConfig?.version ?? "unknown";

/** Where the user is, kept current by the root layout — the screen each report names. */
let screenNow = "/";
export const setCurrentScreen = (screen: string): void => {
  screenNow = screen;
};
export const currentScreen = (): string => screenNow;

/** Reports one error. Returns the reference it was filed under, for the error screen to show. */
export const reportError = (error: unknown): string => {
  const requestId = makeRequestId();
  const err = error instanceof Error ? error : new Error(String(error));
  const token = useSession.getState().token;
  void fetch(`${BASE_URL}/diagnostics/client-errors`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      message: (err.message || err.name || "Unknown error").slice(0, 500),
      stack: err.stack?.slice(0, 4000),
      screen: screenNow.slice(0, 120),
      requestId,
      appVersion: APP_VERSION,
    }),
  }).catch(() => {
    // Offline or asleep — the error is lost to the log, not worth a retry queue.
  });
  return requestId;
};

/** Catches errors nothing else did (a throw in a timer or a promise), reports them, then
 *  hands them on to React Native's own handler so behaviour is otherwise unchanged. */
let installed = false;
export const installGlobalErrorHandler = (): void => {
  if (installed) return;
  installed = true;
  const utils = (globalThis as { ErrorUtils?: { getGlobalHandler: () => (e: Error, fatal?: boolean) => void; setGlobalHandler: (h: (e: Error, fatal?: boolean) => void) => void } }).ErrorUtils;
  if (!utils) return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    reportError(error);
    previous(error, isFatal);
  });
};

export { APP_VERSION };
