import type { DashboardInsights, DashboardSummary } from "@save-n-spend/types"
import { useApiQuery } from "@/lib/query/useApiQuery";

/**
 * `since` is the previous session's open time (see store/lastOpened), fixed for the session,
 * so it keys one entry rather than changing on every render.
 */
export const useDashboardSummary = (since?: string | null) =>
  useApiQuery<DashboardSummary>(`/dashboard/summary${since ? `?since=${encodeURIComponent(since)}` : ""}`);

// The "For You" carousel's genuinely-new slides (a goal's ETA, a no-spend-day count, a
// weekday pattern) — its own request rather than a field on the summary above: these are
// ranked/omit-shaped, not scalars that response otherwise deals in.
export const useDashboardInsights = () => useApiQuery<DashboardInsights>("/dashboard/insights");
