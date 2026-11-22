import { z } from "./z";
import { limit, page, tripRuleParam } from "./fields";

export const highlightsSchemas = { query: z.object({ trips: tripRuleParam }) };

export const highlightHistorySchemas = {
    query: z.object({ page, limit: limit(100, 20) }),
};
