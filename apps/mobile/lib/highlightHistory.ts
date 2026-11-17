import type { IHighlightLog } from "@save-n-spend/types";
import { useApiPages } from "@/lib/query/useApiQuery";

const PAGE_SIZE = 20;

/**
 * The permanent, paginated record — separate from `useHighlights()` (the live,
 * dismissible, capped-at-4 view): this one never shrinks, is never dismissed, and is
 * sorted newest-first straight from the server. Loaded a page at a time on request
 * rather than all at once, since it only grows over the life of the account.
 */
export const useHighlightHistory = () => {
  const { total, ...rest } = useApiPages<IHighlightLog>((page) => `/highlights/history?page=${page}&limit=${PAGE_SIZE}`);
  return { ...rest, totalDocs: total };
};
