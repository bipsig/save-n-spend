import { Pressable, StyleSheet, View } from "react-native"
import Avatar from "../ui/Avatar"
import { AppText } from "../ui/AppText"
import Icon from "../ui/Icon"
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
  const words = name.split(" ");
  const displayInitials = initials || (
    words.length > 1 ? (
      words [0][0].toUpperCase() + words [1][0].toUpperCase()
    ) : (
      name [0].toUpperCase()
    )
  )

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

      <Pressable onPress={onBellPress} style={styles.bell} accessibilityLabel="Alerts">
        <Icon
          name="bell"
          size={20}
          containerSize={44}
          color="ink"
          container="circle"
          containerColor="glass"
        />
        <View style={styles.dot} />
      </Pressable>
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
