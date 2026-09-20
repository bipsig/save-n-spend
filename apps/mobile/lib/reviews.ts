import { useCallback, useEffect, useState } from "react";
import type { ReviewPayload, ReviewPeriod } from "@save-n-spend/types";
import { get } from "@/lib/api";
import { rangeBounds, rangeNavLabel } from "@/lib/dateRange";
import { useSession } from "@/store/session";

// GET /reviews?period=&offset= — computed on demand, same shape as useHealthScore/
// useDashboardSummary. `offset` must be -1 or older (a review is a CLOSED period; the
// server rejects 0).
export const useReview = (period: ReviewPeriod, offset: number) => {
  const status = useSession((s) => s.status);
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (useSession.getState().status !== "authed") return;
    setLoading(true);
    setError(null);
    try {
      setData(await get<ReviewPayload>(`/reviews?period=${period}&offset=${offset}`));
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
    finally {
      setLoading(false);
    }
  }, [period, offset]);

  useEffect(() => {
    if (status === "authed") void refetch();
  }, [status, refetch]);

  return { data, loading, error, refetch };
};

/** The "YYYY-MM-DD" a period's own start falls on — reused as a stable key: two calls
 *  with the same period/offset always agree, and it doubles as something a human could
 *  read if it ever showed up in a log. Built on `rangeBounds`, the exact same calendar
 *  math the Activity screen's own period filter already uses. */
export const periodKey = (period: ReviewPeriod, offset: number): string | undefined =>
  rangeBounds(period, offset).startDate;

/** The period that just closed — offset -1, relative to today. What the auto-surface
 *  banner compares against `settings.lastReviewedPeriod`. */
export const currentPeriodKey = (period: ReviewPeriod): string | undefined =>
  periodKey(period, -1);

export type ReviewHistoryRow = { period: ReviewPeriod; offset: number; label: string };

const HISTORY_LENGTH = 12;

/** Enumerable calendar dates, not a paginated list — there's nothing to fetch here, a
 *  review for any of these is computed fresh the moment it's opened. */
export const listReviewMonths = (): ReviewHistoryRow[] =>
  Array.from({ length: HISTORY_LENGTH }, (_, i) => {
    const offset = -(i + 1);
    return { period: "month", offset, label: rangeNavLabel("month", offset) };
  });

export const listReviewWeeks = (): ReviewHistoryRow[] =>
  Array.from({ length: HISTORY_LENGTH }, (_, i) => {
    const offset = -(i + 1);
    return { period: "week", offset, label: rangeNavLabel("week", offset) };
  });
