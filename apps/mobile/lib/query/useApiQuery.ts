// The one way a screen reads from the API. Every data hook in lib/ is built on these two, so
// every read has the same shape and the same rules (lib/query/core.ts):
//   • fetched once on open; again on focus only when older than 30 s or changed by a write
//   • an answer for one period or filter is never shown under another's label
//   • a write anywhere refetches what it changed (lib/query/invalidate.ts)
//   • offline or while the server wakes, lib/api.ts answers with the saved copy, and
//     `fetchedAt` says when that copy was fetched; back online, what's on screen refetches once
import { useCallback, useContext, useEffect, useRef } from "react";
import { useInfiniteQuery, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { NavigationContext } from "@react-navigation/native";
import type { Paginated } from "@save-n-spend/types";
import { ApiError, getFetched, onServerAwake, type Fetched } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { apiKey, messageOf, refetchIfStale, screenRefetch, statusOf, wireQueries } from "@/lib/query/core";
import { useConnectivity } from "@/store/connectivity";
import { useSession } from "@/store/session";

wireQueries(queryClient, onServerAwake, useSession, useConnectivity);

export type ApiQuery<T> = {
  data: T | null;
  /** The first load: nothing to show yet. */
  loading: boolean;
  /** A later load while `data` is on screen. */
  refreshing: boolean;
  /** The latest failure; cleared when a load succeeds. */
  error: string | null;
  /** The latest failure's HTTP status; 0 when the server never answered (offline). */
  errorStatus: number | null;
  refetch: () => Promise<void>;
  /** When the data on screen was fetched (ms). For a saved copy, when it was saved. */
  fetchedAt: number | null;
};

export type ApiQueryOptions = {
  enabled?: boolean;
  /** While a new key loads, keep showing the previous key's data if both gave the same value
   *  here (Activity keeps its rows across a search, not across a date range). */
  keepPreviousWithin?: string;
  errorMessage?: string;
};

type Meta = { keep?: string };

const useKey = (path: string | null) => {
  const status = useSession((s) => s.status);
  const userId = useSession((s) => s.user?._id ?? null);
  return { key: apiKey(userId, path ?? ""), authed: status === "authed" };
};

/** On a refocus, refetches what has gone stale. Outside a navigator (a sheet's portal) there
 *  is no focus. Returns the screen's refetch, which always fetches. */
const useFocus = (key: QueryKey, paged: boolean) => {
  const client = useQueryClient();
  const navigation = useContext(NavigationContext);
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    if (!navigation) return;
    return navigation.addListener("focus", () => void refetchIfStale(client, keyRef.current, paged));
  }, [navigation, client, paged]);

  return useCallback(() => screenRefetch(client, keyRef.current, paged), [client, paged]);
};

const placeholderFor = (keep: string | undefined) =>
  keep === undefined
    ? undefined
    : <D,>(prev: D | undefined, prevQuery: { meta?: Record<string, unknown> } | undefined) =>
      (prevQuery?.meta as Meta | undefined)?.keep === keep ? prev : undefined;

export const useApiQuery = <T,>(path: string | null, options: ApiQueryOptions = {}): ApiQuery<T> => {
  const { key, authed } = useKey(path);
  const query = useQuery<Fetched<T>>({
    queryKey: key,
    queryFn: () => getFetched<T>(path!),
    enabled: path !== null && authed && options.enabled !== false,
    meta: { keep: options.keepPreviousWithin } satisfies Meta,
    placeholderData: placeholderFor(options.keepPreviousWithin),
  });
  const refetch = useFocus(key, false);
  const shown = query.data;

  return {
    data: shown?.data ?? null,
    loading: shown === undefined && (query.isPending || query.isFetching),
    refreshing: shown !== undefined && query.isFetching,
    error: query.error ? messageOf(query.error, options.errorMessage) : null,
    errorStatus: statusOf(query.error),
    refetch,
    fetchedAt: shown?.fetchedAt ?? null,
  };
};

export type ApiPages<Item> = ApiQuery<Item[]> & {
  items: Item[];
  /** Rows matching across every page, not just those loaded. */
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
};

/** A paginated read. `pathFor(1)` names the whole list, so it is the key. */
export const useApiPages = <Item,>(
  pathFor: ((page: number) => string) | null,
  options: ApiQueryOptions = {},
): ApiPages<Item> => {
  const firstPath = pathFor ? pathFor(1) : null;
  const { key, authed } = useKey(firstPath);
  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: 1,
    queryFn: async ({ pageParam }): Promise<Fetched<Paginated<Item>>> => {
      try {
        return await getFetched<Paginated<Item>>(pathFor!(pageParam));
      }
      catch (err) {
        // A later page with no signal and nothing saved ends the list quietly rather than
        // blanking the rows already shown; the next refresh asks again.
        if (pageParam > 1 && err instanceof ApiError && err.status === 0) {
          return { data: { items: [], page: pageParam, limit: 0, hasNextPage: false, total: 0 }, fetchedAt: Date.now() };
        }
        throw err;
      }
    },
    getNextPageParam: (last) => (last.data.hasNextPage ? last.data.page + 1 : undefined),
    enabled: firstPath !== null && authed && options.enabled !== false,
    meta: { keep: options.keepPreviousWithin } satisfies Meta,
    placeholderData: placeholderFor(options.keepPreviousWithin),
  });
  const refetch = useFocus(key, true);
  const pages = query.data?.pages;
  const items = pages ? pages.flatMap((p) => p.data.items) : [];
  const busy = query.isFetching && !query.isFetchingNextPage;
  const { hasNextPage, isFetching, fetchNextPage } = query;

  const loadMore = useCallback(() => {
    if (!hasNextPage || isFetching) return;
    void fetchNextPage();
  }, [hasNextPage, isFetching, fetchNextPage]);

  return {
    data: pages ? items : null,
    items,
    total: pages?.[0]?.data.total ?? 0,
    hasMore: !!hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore,
    loading: pages === undefined && (query.isPending || busy),
    refreshing: pages !== undefined && busy,
    error: query.error ? messageOf(query.error, options.errorMessage) : null,
    errorStatus: statusOf(query.error),
    refetch,
    fetchedAt: pages?.length ? Math.min(...pages.map((p) => p.fetchedAt)) : null,
  };
};
