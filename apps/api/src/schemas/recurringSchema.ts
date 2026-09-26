import z from "zod";

export const dismissRecurringSchema = z.object({
    key: z.string().min(1).max(200),
}).strict();
