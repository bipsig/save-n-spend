import type { CashFlowPayload } from "@save-n-spend/types";
import { useApiQuery } from "@/lib/query/useApiQuery";

// Today through the end of next month, day by day — see the API's cashFlowMath.
export const useCashFlow = () => useApiQuery<CashFlowPayload>("/cash-flow");

/** "Sat 28 Sep" from a `YYYY-MM-DD` key. Read in UTC because the key is a calendar date,
 *  not a moment (see lib/zone.ts). */
export const dayLabel = (key: string): string =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
