// One shared TanStack QueryClient for the whole app (provided in app/_layout.tsx). Every read
// goes through lib/query/useApiQuery.ts.
import { QueryClient } from '@tanstack/react-query';

/** How long data counts as fresh: opening or refocusing a screen within this reuses it. */
export const STALE_MS = 30_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_MS,
      // lib/api.ts already answers offline from the saved copy, and its D19 loop retries a
      // waking server, so a query always runs and is never retried on top of that.
      networkMode: 'always',
      retry: false,
      // Focus is a screen's, not the app's: lib/query/useApiQuery.ts handles it.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});
