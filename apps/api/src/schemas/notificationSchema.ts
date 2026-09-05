import z from "zod/v4";

export const listNotificationQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    // Smaller than the transaction list's cap: nobody paginates deeply through
    // notifications, they read the top of the list and leave.
    limit: z.coerce.number().int().positive().max(50).default(20),
});
