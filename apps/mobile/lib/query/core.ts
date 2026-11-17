// The rules behind lib/query/useApiQuery.ts, kept free of React and react-native so the tests
// can run them under node against a real QueryClient.
import { onlineManager, type InfiniteData, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { ApiError } from "@/lib/apiError";
import { STALE_MS } from "@/lib/queryClient";
import { API_KEY } from "@/lib/query/invalidate";

/** Every param is in `path`, so each period, filter and page set is its own entry: an answer
 *  for one can never land under another's label. The user is in it so one account's data is
 *  never shown to the next. */
export const apiKey = (userId: string | null | undefined, path: string): QueryKey => [API_KEY, userId ?? "", path];

const exact = (key: QueryKey) => ({ queryKey: key, exact: true, type: "active" as const });

const isFetching = (client: QueryClient, key: QueryKey): boolean =>
  client.getQueryState(key)?.fetchStatus === "fetching";

/** Back to page one before a refetch, so a refresh asks for one page rather than every page
 *  scrolled through. */
const trimToFirstPage = (client: QueryClient, key: QueryKey): void => {
  if (isFetching(client, key)) return;
  client.setQueryData<InfiniteData<unknown, number>>(key, (d) =>
    d && d.pages.length > 1 ? { pages: d.pages.slice(0, 1), pageParams: d.pageParams.slice(0, 1) } : d);
};

/** A fetch already running is joined, never restarted: `cancelRefetch: false`. */
const refetch = (client: QueryClient, key: QueryKey, paged: boolean): Promise<void> => {
  if (paged) trimToFirstPage(client, key);
  return client.refetchQueries(exact(key), { cancelRefetch: false });
};

/** On focus: only data older than STALE_MS, or made stale by a write, is fetched again. */
export const refetchIfStale = (client: QueryClient, key: QueryKey, paged = false): Promise<void> => {
  const query = client.getQueryCache().find({ queryKey: key, exact: true });
  if (!query) return Promise.resolve();
  if (isFetching(client, key)) return refetch(client, key, false);
  return query.isStaleByTime(STALE_MS) ? refetch(client, key, paged) : Promise.resolve();
};

/** The `refetch` a hook hands its screen (pull to refresh, Try again): always asks, joining a
 *  fetch already running. Focus is the hook's own rule (refetchIfStale). */
export const screenRefetch = (client: QueryClient, key: QueryKey, paged = false): Promise<void> =>
  refetch(client, key, paged);

/** Every query on a mounted screen, once: what a server that has just woken is asked. */
export const refetchActive = (client: QueryClient): Promise<void> =>
  client.refetchQueries({ queryKey: [API_KEY], type: "active" }, { cancelRefetch: false });

type SessionLike = { status: string; user: { _id: string } | null };
type Subscribable<S> = { subscribe: (listener: (state: S, prev: S) => void) => () => void };

/** Refetches on server wake (V-5) and once when the app comes back online, and empties the
 *  cache when the account changes. Returns the unsubscribe. */
export const wireQueries = (
  client: QueryClient,
  onServerAwake: (listener: () => void) => () => void,
  session: Subscribable<SessionLike>,
  connectivity: Subscribable<{ offline: boolean }>,
): (() => void) => {
  const offAwake = onServerAwake(() => void refetchActive(client).catch(() => {}));
  // TanStack's online flag follows store/connectivity, which lib/api.ts flips on every request.
  onlineManager.setEventListener((setOnline) =>
    connectivity.subscribe((state, prev) => {
      if (state.offline !== prev.offline) setOnline(!state.offline);
    }));
  const offOnline = onlineManager.subscribe((online) => {
    if (online) void refetchActive(client).catch(() => {});
  });
  const offSession = session.subscribe((state, prev) => {
    const left = prev.status === "authed" && state.status !== "authed";
    if (left || (prev.user?._id ?? null) !== (state.user?._id ?? null)) client.clear();
  });
  return () => { offAwake(); offOnline(); offSession(); };
};

/** The message a hook's `error` carries. */
export const messageOf = (err: unknown, fallback = "Failed to load"): string =>
  err instanceof Error && err.message ? err.message : fallback;

/** A hook's `errorStatus`: the failure's HTTP status, 0 when the server never answered, null
 *  with no error (or one that isn't a request's). */
export const statusOf = (err: unknown): number | null =>
  err instanceof ApiError ? err.status : null;
