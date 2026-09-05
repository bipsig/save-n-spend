import { useCallback, useRef } from "react";
import { haptics } from "./haptics";

// The charts report a scrub index from `onResponderMove`, which for a drag across a
// month is dozens of calls a second. A tick per call would be one continuous buzz,
// so this fires only when the index actually changes — the feel of a native picker
// rolling from one row to the next, which is exactly what a scrub is.
//
// `active` is the index currently on screen, and it's what a report is compared
// against rather than a private "last seen" value. That means two touch moves
// landing in the same slot can't double-tick, and a tooltip the screen has since
// cleared can be re-opened on the same slot and still tick.
export const useScrubTick = (
  active: number | null,
  onScrub?: (i: number | null) => void
) => {
  const shown = useRef(active);
  shown.current = active;

  return useCallback(
    (i: number | null) => {
      if (i !== shown.current) {
        shown.current = i;
        // Nothing on the way out: closing a tooltip is the screen taking something
        // away, not the user landing on a value.
        if (i !== null) haptics.select();
      }
      onScrub?.(i);
    },
    [onScrub]
  );
};

export default useScrubTick;
