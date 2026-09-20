// The pure half of net-worth reconstruction — mirrors streakMath.ts/highlightSnapshotMath.ts's
// split from their own *Service.ts: no database, no clock beyond what's passed in, so a
// fixture test can pin the arithmetic exactly.

export type MonthDelta = { key: string; delta: number };

/**
 * Net worth at the START of each of the last `monthsAvailable` complete months
 * (= the END of the month before it), oldest first, followed by the current total as
 * the final point. `boundaryKeys[i]` is the "YYYY-MM" key of the i-th boundary's month,
 * oldest first — the caller derives these from calendar arithmetic (see
 * netWorthHistoryService.ts); this function only does the subtraction.
 *
 * Net worth at a boundary is the current total minus every month's delta from that
 * boundary's month through now, inclusive — computed independently per boundary rather
 * than by a running subtraction, so one wrong step can't throw off every point after it.
 */
export const reconstructTrend = (
  currentNetWorth: number,
  deltas: MonthDelta[],
  boundaryKeys: string[],
): number[] =>
  boundaryKeys.map((boundaryKey) => {
    const sumFromBoundary = deltas
      .filter((d) => d.key >= boundaryKey)
      .reduce((sum, d) => sum + d.delta, 0);
    return currentNetWorth - sumFromBoundary;
  });
