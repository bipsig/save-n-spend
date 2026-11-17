import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { errorMessage, type ScreenState } from "@/lib/screenStates";

/**
 * For a screen whose list lives in a store (accounts, categories) rather than a query: no
 * write or focus rule refreshes a store, so this reloads it each time the screen gains
 * focus, and hands ScreenScaffold / ScreenStates the same state a query hook would.
 * `fetchedAt` is the store's own, so the offline strip gives this list's age (D18).
 */
export const useStoreLoad = (loaded: boolean, load: () => Promise<void>, fetchedAt: number | null): ScreenState => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setBusy(true);
    try {
      await load();
      setError(null);
    }
    catch (err) {
      setError(errorMessage(err instanceof Error ? err : String(err)) ?? "Couldn't load this");
    }
    finally {
      setBusy(false);
    }
  }, [load]);

  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));

  return { loading: !loaded && busy, refreshing: loaded && busy, error, hasData: loaded, refetch, fetchedAt };
};
