import { z } from "./z";
import { limit, objectId, page } from "./fields";

export const listNotificationsSchemas = {
    query: z.object({
        page,
        // Smaller than the transaction list's cap: nobody paginates deeply through
        // notifications, they read the top of the list and leave.
        limit: limit(50),
    }),
};

export const markNotificationReadSchemas = { params: z.object({ id: objectId("Notification") }), body: z.object({}).strict() };

export const markAllNotificationsReadSchemas = { body: z.object({}).strict() };
