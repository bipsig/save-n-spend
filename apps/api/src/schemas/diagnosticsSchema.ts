import z from "zod";

// An error the phone hit — a crash caught by the app's error screen, or a JS error nothing
// caught. Only what's needed to find and fix it: what, where, which build.
export const clientErrorSchema = z.object({
    message: z.string().min(1).max(500),
    stack: z.string().max(4000).optional(),
    /** The screen it happened on, e.g. `/investment-detail`. */
    screen: z.string().max(120).optional(),
    /** The phone's own reference for this report, if it made one. */
    requestId: z.string().max(12).optional(),
    appVersion: z.string().max(20).optional(),
}).strict();
