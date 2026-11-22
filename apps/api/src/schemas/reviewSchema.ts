import { z } from "./z";
import { tripRuleParam } from "./fields";

// Stricter than the insights query — day/year don't apply to a review.
export const reviewSchemas = {
    query: z.object({
        period: z.enum(["week", "month"]).default("month"),
        // How many whole periods back. 0 = the period containing today (not yet closed),
        // -1 = the one that just closed, and so on.
        offset: z.coerce.number().int().max(-1, "That period hasn't finished yet").default(-1),
        trips: tripRuleParam,
    }),
};
