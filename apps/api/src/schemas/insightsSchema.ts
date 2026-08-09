import z from "zod";

export const insightsQuerySchema = z.object({
    period: z.enum(["week", "month", "year"]).default("month"),
    // How many whole periods back from the current one. 0 = current, -1 = the
    // previous week/month/year, and so on. Future windows are not allowed.
    offset: z.coerce.number().int().max(0).default(0)
});
