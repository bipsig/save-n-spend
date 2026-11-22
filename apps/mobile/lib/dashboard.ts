import type { DashboardInsights, DashboardSummary, HomePeriod } from "@save-n-spend/types"
import { useApiQuery } from "@/lib/query/useApiQuery";
import { buildQuery } from "@/lib/transactionQuery";

/**
 * `since` is the previous session's open time (see store/lastOpened), fixed for the session,
 * so it keys one entry rather than changing on every render. `period` is Home's switch: the
 * four tiles' figures cover it. Each closed trip counts once, on its close day.
 */
export const useDashboardSummary = (since: string | null | undefined, period: HomePeriod) =>
  useApiQuery<DashboardSummary>(`/dashboard/summary${buildQuery({ period, trips: "entries", since: since ?? undefined })}`);

// The "For You" carousel's genuinely-new slides (a goal's ETA, a no-spend-day count, a
// weekday pattern) — its own request rather than a field on the summary above: these are
// ranked/omit-shaped, not scalars that response otherwise deals in.
export const useDashboardInsights = () => useApiQuery<DashboardInsights>("/dashboard/insights?trips=entries");
