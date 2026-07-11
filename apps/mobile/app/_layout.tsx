import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";

SplashScreen.preventAutoHideAsync();

const RootLayout = () => {
  // Midnight Glass uses the system font (SF Pro / Roboto) — nothing to load.
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <BottomSheetModalProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#0C0A16" },
          }}
          >
            <Stack.Screen name="add-transaction" options={{ presentation: "modal" }} />
          </Stack>
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

export default RootLayout;
