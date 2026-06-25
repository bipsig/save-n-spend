import { Tabs } from "expo-router"

const TabsLayout = () => {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#625FFF",
        tabBarInactiveTintColor: "#99a1af"
      }}
    >
      <Tabs.Screen name="index" options = {{ title: "Home" }} />
      <Tabs.Screen name="transactions" options = {{ title: "Transactions" }} />
      <Tabs.Screen name="settings" options = {{ title: "Settings" }} />
    </Tabs>
  )
}

export default TabsLayout;