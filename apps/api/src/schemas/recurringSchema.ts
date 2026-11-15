import { z } from "./z";

export const dismissRecurringSchemas = {
    body: z.object({
        key: z.string().min(1).max(200),
    }).strict(),
};
