import { z } from "./z";
import { month, tripRuleParam } from "./fields";

export const dashboardSummarySchemas = {
  query: z.object({
    month: month.optional(),
    // The client's own stored "last opened" moment, so the digest is relative to THIS
    // phone's last visit rather than a server-side notion of a session.
    since: z.iso.datetime().optional(),
    // Home's tiles (2.8.6): this month, this year, or everything since the first record.
    period: z.enum(["month", "year", "all"]).optional(),
    trips: tripRuleParam,
  }),
};

export const dashboardInsightsSchemas = { query: z.object({ trips: tripRuleParam }) };
