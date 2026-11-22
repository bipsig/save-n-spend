import type { CashFlowPayload } from "@save-n-spend/types";
import { useApiQuery } from "@/lib/query/useApiQuery";
import { formatCalendar } from "@/lib/format/date";

// Today through the end of next month, day by day — see the API's cashFlowMath.
export const useCashFlow = () => useApiQuery<CashFlowPayload>("/cash-flow");

/** "Sat, 28 Sep" from a `YYYY-MM-DD` key, a calendar date, not a moment. */
export const dayLabel = (key: string): string => formatCalendar(key, "weekday");
