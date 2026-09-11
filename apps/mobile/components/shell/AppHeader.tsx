import { StyleSheet, View } from "react-native"
import Avatar from "../ui/Avatar"
import { AppText } from "../ui/AppText"
import Icon from "../ui/Icon"
import PressableScale from "../ui/PressableScale"
import PeekButton from "./PeekButton"
import { useNotifications } from "@/store/notifications"
import { useGreeting } from "@/lib/greeting"
import { colors, spacing } from "@/theme"

type Props = {
  name: string,
  /** Overrides the derived greeting. Nothing passes it — it exists so a screen with a
   *  reason to say something specific can, without reaching into `lib/greeting`. */
  greeting?: string
  initials?: string
  onBellPress?: () => void
}

const AppHeader = ({
  name,
  greeting,
  initials,
  onBellPress
}: Props) => {
  // The dot means one thing: there is something unread behind the bell.
  const unread = useNotifications((s) => s.unread);

  // The hook, not a bare `greetingFor()`: it re-derives when the time of day rolls over and
  // when the app is reopened, which a value computed at mount never does.
  const derived = useGreeting();
  const label = greeting ?? derived;

  // Derive up to two initials, tolerating an empty/whitespace name (e.g. the
  // brief frame during logout before the gate swaps to Login).
  const displayInitials =
    initials ||
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") ||
    "?";

  // Spec .topbar, but a size up on all three, and the greeting promoted over the name. At the
  // spec's 10.5 dim over 14/700 the row read as a caption above the dashboard rather than the
  // dashboard's own title — every other screen opens on 30/800. The greeting is the line worth
  // reading (it changes; the name does not), so it takes the title slot with the name under it.
  // Both are one line, ellipsised, so a long name can't push the bell around.
  return (
    <View style={styles.container}>
      <View style={styles.leftContainer}>
        <Avatar initials={displayInitials} size="md" gradient />
        <View style={styles.who}>
          <AppText weight="black" size="md" numberOfLines={1}>
            {label}
          </AppText>
          <AppText size="sm" weight="semibold" color="inkDim" numberOfLines={1}>
            {name}
          </AppText>
        </View>
      </View>

      <View style={styles.actions}>
        <PeekButton />

        {/* `disabled` without a handler, so a bell that leads nowhere doesn't dip or
            buzz and promise an alerts screen that isn't there yet. */}
        <PressableScale
          onPress={onBellPress}
          disabled={!onBellPress}
          scaleTo={0.9}
          style={styles.bell}
          accessibilityLabel={unread > 0 ? `Alerts, ${unread} unread` : "Alerts"}
        >
          <Icon
            name="bell"
            size={20}
            containerSize={44}
            color="ink"
            container="circle"
            containerColor="glass"
          />
          {unread > 0 && <View style={styles.dot} />}
        </PressableScale>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  leftContainer: {
    flex: 1, // takes the row's slack, so the two lines ellipsise instead of shoving the actions
    flexDirection: "row",
    alignItems: "center",
    gap: 12 // spec .who gap × device scale
  },
  who: {
    flex: 1,
    minWidth: 0, // a flex item is never squeezed under its own text without this
    gap: 1,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  bell: {
    position: "relative"
  },
  dot: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.danger,
    shadowColor: colors.danger,
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  }
})

export default AppHeader;
