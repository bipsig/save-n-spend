import { z } from "./z";
import { month } from "./fields";

export const dashboardSummarySchemas = {
  query: z.object({
    month: month.optional(),
    // The client's own stored "last opened" moment, so the digest is relative to THIS
    // phone's last visit rather than a server-side notion of a session.
    since: z.iso.datetime().optional(),
  }),
};
