// One shared TanStack QueryClient for the whole app (provided in app/_layout.tsx).
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Treat data as fresh for 30s so tab switches don't refetch constantly.
      staleTime: 30_000,
      // Retry transient failures once, but never a 401 — the api interceptor has
      // already signed the user out, so retrying is pointless.
      retry: (failureCount, error) => {
        if ((error as { status?: number })?.status === 401) return false;
        return failureCount < 1;
      },
    },
  },
});
