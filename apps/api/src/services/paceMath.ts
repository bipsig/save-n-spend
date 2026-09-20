// The pure half of the "this month vs your average" pace comparison — mirrors
// netWorthMath.ts/streakMath.ts's split from their own *Service.ts / controller I/O.

export type ReferenceMonth = { daysInMonth: number };

/**
 * Total expense on each day-of-month, averaged across `referenceMonths` — but each
 * day-index divides only by however many of those months actually HAVE that day, not by
 * the flat count of months. Day 31 must divide by however many 31-day months are in the
 * window, or a run of 30-day months would silently drag every late-month average down
 * toward zero for a day most of the window never had at all.
 *
 * `sumByDay` need only contain entries for days with spend — a day with none is a real
 * zero, not a missing key, and is treated as such by the `?? 0` below.
 */
export const averageByDayOfMonth = (
  sumByDay: Map<number, number>,
  referenceMonths: ReferenceMonth[],
): number[] => {
  const maxDay = Math.max(...referenceMonths.map((m) => m.daysInMonth), 0);
  const result: number[] = [];
  for (let day = 1; day <= maxDay; day++) {
    const denominator = referenceMonths.filter((m) => m.daysInMonth >= day).length;
    result.push(denominator > 0 ? Math.round((sumByDay.get(day) ?? 0) / denominator) : 0);
  }
  return result;
};
