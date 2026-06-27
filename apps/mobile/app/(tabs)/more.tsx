import ScreenScaffold from "@/components/shell/ScreenScaffold"
import { AppText } from "@/components/ui/AppText"
import Icon from "@/components/ui/Icon";
import moreItems from "@/data/menu"
import { colors, radius, spacing } from "@/theme";
import { router } from "expo-router";
import { Pressable, StyleSheet } from "react-native";

const MoreScreen = () => {
  const menuItems = moreItems;

  return (
    <ScreenScaffold title="More" name="Sagnik">
      {menuItems.map((item) => {
        return (
          <Pressable
            key={item.key}
            onPress={() => router.push(item.path)}
            style={styles.row}
          >
            <Icon
              name={item.icon}
              color="primary"
              container="circle"
              containerColor="accentSoft"
            />
            <AppText weight="bold" size="md" style={styles.label}>
              {item.label}
            </AppText>
            <Icon
              name="chevronRight"
              color="gray400"
            />
          </Pressable>
        )
      })}
    </ScreenScaffold>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md
  },
  label: {
    flex: 1
  }
})

export default MoreScreen;
