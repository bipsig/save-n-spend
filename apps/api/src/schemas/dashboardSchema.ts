import z from "zod/v4";

export const dashboardSummaryQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  // The client's own stored "last opened" moment, so the digest is relative to THIS
  // phone's last visit rather than a server-side notion of a session.
  since: z.iso.datetime().optional()
});