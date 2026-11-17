// What a data screen draws for the state its fetch is in, and which one strip sits under its
// header. Pure, so the decision table is tested; components/states/ScreenStates.tsx and
// components/shell/ScreenStrip.tsx only draw what these return.

/** A hook's error: the 2.8.2 hooks hand over the friendly line, the 2.8.3 fetch layer an `ApiError`. */
export type ScreenError = string | Error | null | undefined;

/** The fetch layer's `{ data, loading, refreshing, error, refetch, fetchedAt }`, with `data`
 *  reduced to `hasData`: an answer (live or saved) is on hand, even an empty list. */
export type ScreenState = {
  /** First load only. */
  loading: boolean;
  refreshing?: boolean;
  /** The latest failure only; cleared by the next success. */
  error: ScreenError;
  hasData: boolean;
  refetch: () => unknown;
  /** When the data on screen was fetched (ms epoch); from the cache entry when served offline. */
  fetchedAt?: number | null;
  /** A 404, or no id to load: the record isn't there. */
  notFound?: boolean;
};

export type ScreenView = "notFound" | "content" | "error" | "skeleton";

/** Data on hand always wins over an error, so a failed refresh never replaces what's on screen
 *  (D15 A). With neither data nor an error the answer hasn't come yet: skeleton. */
export const screenView = (s: Pick<ScreenState, "hasData" | "error" | "notFound">): ScreenView => {
  if (s.notFound) return "notFound";
  if (s.hasData) return "content";
  if (s.error) return "error";
  return "skeleton";
};

export type StripKind = "offline" | "waking" | "refreshFailed";

/** One strip at a time under the header. Offline explains a waking server and a failed
 *  refresh; a waking server explains a failed refresh. */
export const stripFor = (s: { offline: boolean; waking: boolean; hasData?: boolean; error?: ScreenError }): StripKind | null => {
  if (s.offline) return "offline";
  if (s.waking) return "waking";
  if (s.hasData && s.error) return "refreshFailed";
  return null;
};

/** A Home card (D16 A). `empty`: loaded with nothing worth a card, so it isn't drawn. Loading
 *  draws nothing, as the cards did before. */
export type HomeCardView = "content" | "hidden" | "error";

export const homeCardView = (s: { hasData: boolean; error: ScreenError; empty?: boolean }): HomeCardView => {
  if (s.hasData) return s.empty ? "hidden" : "content";
  if (s.error) return "error";
  return "hidden";
};

export const errorMessage = (error: ScreenError): string | undefined =>
  !error ? undefined : typeof error === "string" ? error : error.message || undefined;

/** From iOS's first accessibility text size (AX1, fontScale 1.786; xxxLarge is 1.353) a strip's message and its "Try again"
 *  can't share a line without breaking words, so the action goes underneath. */
export const STACK_ACTION_FONT_SCALE = 1.6;
export const stacksAction = (fontScale: number): boolean => fontScale >= STACK_ACTION_FONT_SCALE;

/** Several fetches drawn as one screen: it has data when every part has, shows the first
 *  error, and its age is the oldest part's. */
export const mergeScreenStates = (...states: ScreenState[]): ScreenState => {
  const ages = states.map((s) => s.fetchedAt).filter((at): at is number => typeof at === "number");
  return {
    loading: states.some((s) => s.loading),
    refreshing: states.some((s) => s.refreshing),
    error: states.find((s) => s.error)?.error ?? null,
    hasData: states.every((s) => s.hasData),
    notFound: states.some((s) => s.notFound),
    fetchedAt: ages.length ? Math.min(...ages) : null,
    refetch: () => Promise.all(states.map((s) => s.refetch())),
  };
};
