import { StyleSheet, View } from "react-native"
import Avatar from "../ui/Avatar"
import { AppText } from "../ui/AppText"
import Icon from "../ui/Icon"
import PressableScale from "../ui/PressableScale"
import PeekButton from "./PeekButton"
import { useNotifications } from "@/store/notifications"
import { colors, spacing } from "@/theme"

type Props = {
  name: string,
  greeting?: string
  initials?: string
  onBellPress?: () => void
}

const AppHeader = ({
  name,
  greeting = "Good Evening",
  initials,
  onBellPress
}: Props) => {
  // The dot used to be painted unconditionally, which made it decoration. It now means
  // one thing: there is something unread behind the bell.
  const unread = useNotifications((s) => s.unread);

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

  // Spec .topbar — gradient avatar, 10.5 dim greeting over 14/700 name,
  // 36px glass bell circle with a glowing red alert dot.
  return (
    <View style={styles.container}>
      <View style={styles.leftContainer}>
        <Avatar initials={displayInitials} size="md" gradient />
        <View>
          <AppText size="xs" color="inkDim">
            {greeting}
          </AppText>
          <AppText weight="bold" size="sm">
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
    flexDirection: "row",
    alignItems: "center",
    gap: 12 // spec .who gap × device scale
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
