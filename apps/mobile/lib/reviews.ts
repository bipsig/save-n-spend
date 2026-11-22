import type { ReviewPayload, ReviewPeriod } from "@save-n-spend/types";
import { rangeBounds, rangeNavLabel } from "@/lib/dateRange";
import { useApiQuery } from "@/lib/query/useApiQuery";

// GET /reviews?period=&offset= — computed on demand, same shape as useHealthScore/
// useDashboardSummary. `offset` must be -1 or older (a review is a CLOSED period; the
// server rejects 0).
export const useReview = (period: ReviewPeriod, offset: number, enabled = true) =>
  useApiQuery<ReviewPayload>(enabled ? `/reviews?period=${period}&offset=${offset}&trips=entries` : null);

/** The "YYYY-MM-DD" a period's own start falls on — reused as a stable key: two calls
 *  with the same period/offset always agree, and it doubles as something a human could
 *  read if it ever showed up in a log. Built on `rangeBounds`, the exact same calendar
 *  math the Activity screen's own period filter already uses. */
export const periodKey = (period: ReviewPeriod, offset: number): string | undefined =>
  rangeBounds(period, offset).startDate;

/** The period that just closed — offset -1, relative to today. What the auto-surface
 *  banner compares against `useSeen`'s `lastReviewedPeriod`. */
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
