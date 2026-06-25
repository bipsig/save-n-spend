import { theme } from "@/theme";
import { Tabs } from "expo-router"

const TabsLayout = () => {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.indigo,
        tabBarInactiveTintColor: theme.colors.gray400
      }}
    >
      <Tabs.Screen name="index" options = {{ title: "Home" }} />
      <Tabs.Screen name="transactions" options = {{ title: "Transactions" }} />
      <Tabs.Screen name="settings" options = {{ title: "Settings" }} />
    </Tabs>
  )
}

export default TabsLayout;