// Which screens' reads a successful write makes stale. lib/api.ts calls `afterWrite` for every
// write it sends, so a write made from a screen, a sheet or a store refreshes the same way.
//
// Kept free of any lib/api import: api.ts imports this file.
import { queryClient } from "@/lib/queryClient";

/** Every read the app makes is keyed `["api", userId, path]` (see `apiKey` in lib/query/core.ts). */
export const API_KEY = "api";

/** The first segment of a path, without the query: "/transactions/summary?x=1" → "transactions". */
export const resourceOf = (path: string): string => path.split("?")[0].split("/").filter(Boolean)[0] ?? "";

/**
 * The read resources a write to `path` changes: "all", or a list of first path segments.
 *
 * Nearly every write moves money or what it is filed under, and nearly every read (the
 * dashboard, insights, health, highlights, reviews) is built from it, so the default is
 * everything. Listed here are only the writes that change nothing a query shows.
 */
export const readsChangedBy = (path: string, body?: unknown): "all" | string[] => {
  const bare = path.split("?")[0];
  switch (resourceOf(path)) {
    case "auth":
    case "notifications": // read by store/notifications, not a query
      return [];
    case "users": {
      // A new zone moves every "today" and "this month"; a name or push token moves nothing.
      const prefs = (body as { prefs?: Record<string, unknown> } | undefined)?.prefs;
      return prefs && "timeZone" in prefs ? "all" : [];
    }
    case "recurring": // dismissing a suggestion
      return ["recurring"];
    case "trips":
      return bare.endsWith("/import/preview") ? [] : "all";
    default:
      return "all";
  }
};

/** Marks the reads a write changed as stale; the ones on a mounted screen refetch now, the
 *  rest when they are next shown. */
export const invalidateReads = (reads: "all" | string[]): Promise<void> => {
  if (reads !== "all" && reads.length === 0) return Promise.resolve();
  return queryClient.invalidateQueries({
    queryKey: [API_KEY],
    ...(reads === "all" ? {} : { predicate: (q) => reads.includes(resourceOf(String(q.queryKey[2] ?? ""))) }),
  });
};

export const afterWrite = (path: string, body?: unknown): void => {
  void invalidateReads(readsChangedBy(path, body)).catch(() => {});
};
