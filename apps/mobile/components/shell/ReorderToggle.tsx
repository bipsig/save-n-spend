import Icon from "../ui/Icon";
import PressableScale from "../ui/PressableScale";
import { haptics } from "@/lib/haptics";

type Props = {
  active: boolean;
  onPress: () => void;
  /** Nothing to reorder — a single row, or none. */
  disabled?: boolean;
};

/**
 * Header control that puts a manage screen in and out of reorder mode.
 *
 * Icon-only, matching `PeekButton`: these headers already carry a back button, a title and a
 * New pill, and a labelled button would squeeze the title. The tick is what closes the mode,
 * so its meaning is the same as a Done button's without the width.
 */
const ReorderToggle = ({ active, onPress, disabled = false }: Props) => {
  if (disabled) return null;

  return (
    <PressableScale
      onPress={() => {
        haptics.toggle();
        onPress();
      }}
      scaleTo={0.9}
      haptic={false}
      accessibilityLabel={active ? "Finish reordering" : "Reorder"}
      accessibilityState={{ selected: active }}
    >
      <Icon
        name={active ? "check" : "reorder"}
        size={20}
        containerSize={44}
        // Filled while the mode is on: the grips on the rows say what can be moved, but only
        // this says the screen is still in a mode the user has to leave. `primaryInk` on
        // `primary` — the brand token is bright enough that white on it barely reads.
        color={active ? "primaryInk" : "ink"}
        container="circle"
        containerColor={active ? "primary" : "glass"}
      />
    </PressableScale>
  );
};

export default ReorderToggle;
