// Where lib/api.ts saves a GET's answer for offline use, and what of it. Every path but Home's
// summary is saved as it is. Pure, so it's tested under node (lib/offlineSlot.test.ts).

const SUMMARY = "/dashboard/summary";

const isSummary = (path: string) => path.split("?")[0] === SUMMARY;

/** Home's summary is asked with `since` (the previous open), which is new on every launch, so a
 *  copy saved under it is never found by the next cold launch. It's saved without `since`. */
export const offlinePath = (path: string): string => {
  if (!isSummary(path)) return path;
  const [base, query = ""] = path.split("?");
  const rest = query.split("&").filter((p) => p && !p.startsWith("since="));
  return rest.length ? `${base}?${rest.join("&")}` : base;
};

/** The saved summary leaves out "Since you last opened": its figures belong to the `since` it
 *  was asked with, not to the launch that reads it back. Without it Home hides that card. */
export const offlineData = (path: string, data: unknown): unknown => {
  if (!isSummary(path) || !data || typeof data !== "object" || !("sinceLastOpened" in data)) return data;
  const { sinceLastOpened: _digest, ...rest } = data as Record<string, unknown>;
  return rest;
};
