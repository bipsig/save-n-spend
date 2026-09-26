import { theme } from "@/theme";
import { haptics } from "@/lib/haptics";
import { iconMap } from "@/lib/icons";
import { MaterialIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router"

const TabsLayout = () => {
  return (
    <Tabs
      // On the navigator so all four tabs tick identically — a per-screen listener
      // is one more thing to forget when a tab is added. `selectionAsync`, not an
      // impact: the tab bar is a set you move through, same as a chip row.
      screenListeners={{ tabPress: () => haptics.select() }}
      screenOptions={{
        headerShown: false,
        // No transition. Any animated tab switch can be interrupted partway — a quick
        // second tap, a re-render as data lands — and leave the incoming tab stuck at the
        // animation's start: blank under "fade" (opacity 0; it flashes into view only as
        // you leave), mis-placed under "shift". An instant cut has nothing to get stuck,
        // and it's how native iOS tab bars behave anyway. Stack pushes keep their slide.
        animation: "none",
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
