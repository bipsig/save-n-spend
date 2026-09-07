import Icon from "../ui/Icon"
import PressableScale from "../ui/PressableScale"
import { haptics } from "@/lib/haptics"
import { useSettings } from "@/store/settings"

// The always-there half of the peek gesture. Tapping a masked amount works, but it
// requires an amount to be on screen and visibly tappable — this is the control the
// user can find without hunting, and the one that puts the mask back.
//
// Absent entirely with privacy mode off: an eye that does nothing would imply the
// app is hiding something. That self-hiding is what lets `ScreenScaffold` render it on
// every screen unconditionally, which is the point of it living here rather than inside
// `AppHeader`: it used to exist only on the dashboard, so switching privacy mode on and
// then opening Budget left the user with masked figures and no way to reveal them
// except by navigating back.
const PeekButton = () => {
  const privacyMode = useSettings((s) => s.privacyMode)
  const peeking = useSettings((s) => s.peeking)
  const peek = useSettings((s) => s.peek)
  const hide = useSettings((s) => s.hide)

  if (!privacyMode) return null

  return (
    <PressableScale
      onPress={() => {
        haptics.toggle()
        if (peeking) hide()
        else peek()
      }}
      scaleTo={0.9}
      haptic={false}
      accessibilityLabel={peeking ? "Hide amounts" : "Show amounts"}
    >
      {/* The glyph shows what a tap DOES, not what the current state is — an open
          eye while amounts are hidden reads as the offer it is. */}
      <Icon
        name={peeking ? "eyeOff" : "eye"}
        size={20}
        containerSize={44}
        color="ink"
        container="circle"
        containerColor="glass"
      />
    </PressableScale>
  )
}

export default PeekButton;
