import { router } from "expo-router";
import PressableScale from "@/components/ui/PressableScale";
import Icon from "@/components/ui/Icon";

type Props = {
  /**
   * `close` for a modal presentation — an ✕ in a glass circle, because a sheet
   * that slid up from the bottom has no "back" to go to, only a way out.
   */
  variant?: "back" | "close";
  /** Defaults to `router.back()`. Override where leaving needs a confirm first. */
  onPress?: () => void;
};

// Every screen that isn't a tab starts with one of these, and before this they were
// eight separate copies of the same Pressable. One component so they all answer a
// tap the same way — a deep squeeze and a light tick — and so "back" only has to be
// re-tuned in one place.
const BackButton = ({ variant = "back", onPress }: Props) => (
  <PressableScale
    onPress={onPress ?? (() => router.back())}
    // Deeper than a row's: a bare glyph has no surface to shrink, so the movement
    // has to be obvious enough to read on the icon alone.
    scaleTo={0.86}
    hitSlop={8}
    accessibilityRole="button"
    accessibilityLabel={variant === "close" ? "Close" : "Go back"}
  >
    {variant === "close" ? (
      <Icon
        name="close"
        size={16}
        containerSize={32}
        container="circle"
        containerColor="glass"
        color="inkDim"
      />
    ) : (
      <Icon name="chevronLeft" size={28} color="ink" />
    )}
  </PressableScale>
);

export default BackButton;
