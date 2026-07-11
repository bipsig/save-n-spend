import { theme } from "@/theme";
import { iconMap } from "@/lib/icons";
import { MaterialIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router"

const TabsLayout = () => {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#A394FF", // spec .tabi.on — violet
        tabBarInactiveTintColor: theme.colors.inkDim,
        tabBarStyle: {
          backgroundColor: "#100E1C",
          borderTopColor: "rgba(255,255,255,0.09)",
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name={iconMap.home} color={color} size={size} />
          )
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: "Activity",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name={iconMap.activity} color={color} size={size} />
          )
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: "Insights",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name={iconMap.insights} color={color} size={size} />
          )
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name={iconMap.more} color={color} size={size} />
          )
        }}
      />
    </Tabs>
  )
}

export default TabsLayout;
