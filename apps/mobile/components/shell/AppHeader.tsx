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

  return (
    <View style={styles.container}>
      <View style={styles.leftContainer}>
        <Avatar
          initials={displayInitials}
          size="md"
          background="primary"
          textColor="surface"
        />
        <View>
          <AppText size="sm" color="gray500">
            {greeting}
          </AppText>
          <AppText weight="bold" size="md">
            {name}
          </AppText>
        </View>
      </View>

      <Pressable onPress={onBellPress} style={styles.bell}>
        <Icon
          name="bell"
          color="gray700"
          container="circle"
          containerColor="surface2"
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
    gap: spacing.md
  },
  bell: {
    position: "relative"
  },
  dot: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: colors.surface
  }
})

export default AppHeader;
