import { z } from "./z";
import { objectId } from "./fields";

const insightsQuery = z.object({
    period: z.enum(["day", "week", "month", "year"]).default("month"),
    // How many whole periods back from the current one. 0 = current, -1 = the
    // previous week/month/year, and so on. Future windows are not allowed.
    offset: z.coerce.number().int().max(0, "You can't look at a future period").default(0),
});

export const insightsSchemas = { query: insightsQuery };

export const categoryInsightsSchemas = {
    params: z.object({ id: objectId("Category") }),
    query: insightsQuery,
};
