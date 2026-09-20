import z from "zod";

// Stricter than insightsQuerySchema — day/year don't apply to a review.
export const reviewQuerySchema = z.object({
    period: z.enum(["week", "month"]).default("month"),
    // How many whole periods back. 0 = the period containing today (not yet closed —
    // the controller rejects this), -1 = the one that just closed, and so on.
    offset: z.coerce.number().int().max(-1).default(-1),
});
