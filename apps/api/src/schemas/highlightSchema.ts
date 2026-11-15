import { z } from "./z";
import { limit, page } from "./fields";

export const highlightHistorySchemas = {
    query: z.object({ page, limit: limit(100, 20) }),
};
