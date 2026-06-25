import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts, Lato_400Regular, Lato_700Bold, Lato_900Black } from "@expo-google-fonts/lato";
import { useEffect } from "react";

SplashScreen.preventAutoHideAsync();

const RootLayout = () => {
  const [loaded] = useFonts({ Lato_400Regular, Lato_700Bold, Lato_900Black });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <Stack screenOptions={{
      headerShown: false
    }}
    />
  )
}

export default RootLayout;