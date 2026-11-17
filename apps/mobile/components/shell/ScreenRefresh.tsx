import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl } from "react-native";
import { colors } from "@/theme";

/**
 * The one pull-to-refresh control. ScreenScaffold uses it for its scroll view; a screen with its
 * own list (Activity's FlatList) passes the result as `refreshControl`.
 *
 * The spinner runs from the pull until `onRefresh`'s promise settles, so a screen passes its
 * `refetch` and nothing else. A background refetch (focus, reconnect) never shows it. `refreshing`
 * is for the 2.8.2 screens that still hold their own pull state.
 */
export const useScreenRefresh = (onRefresh?: () => unknown, refreshing = false) => {
  const [pulling, setPulling] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => {
    mounted.current = false;
  }, []);

  const pull = useCallback(async () => {
    setPulling(true);
    try {
      await onRefresh?.();
    }
    catch {
      // The screen's own state shows the failure (the "Couldn't refresh" strip).
    }
    finally {
      if (mounted.current) setPulling(false);
    }
  }, [onRefresh]);

  if (!onRefresh) return undefined;
  return (
    // Tinted to the brand: a plain system spinner over this ground reads as broken.
    <RefreshControl
      refreshing={pulling || refreshing}
      onRefresh={pull}
      tintColor={colors.primary}
      colors={[colors.primary]}
      progressBackgroundColor="#1B1730"
    />
  );
};
