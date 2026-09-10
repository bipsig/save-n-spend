import { useCallback, useRef } from "react";
import { haptics } from "./haptics";

// The charts report a scrub index from `onResponderMove` — dozens of calls a second across a
// month, so a tick per call would be one continuous buzz. This fires only when the index
// changes, giving the feel of a native picker rolling from one row to the next.
//
// A report is compared against `active`, the index currently on screen, rather than a private
// "last seen" value: two moves landing in the same slot can't double-tick, and a slot whose
// tooltip the screen has cleared can be re-opened and still tick.
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
