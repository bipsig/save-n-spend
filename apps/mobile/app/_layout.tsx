import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { QueryClientProvider } from "@tanstack/react-query";
import type { IUser } from "@save-n-spend/types";
import { queryClient } from "@/lib/queryClient";
import { get } from "@/lib/api";
import { useSession } from "@/store/session";
import { useCategoryStore } from "@/store/categories";
import { useAccountStore } from "@/store/accounts";

SplashScreen.preventAutoHideAsync();

const RootLayout = () => {
  const status = useSession((s) => s.status);
  const hydrate = useSession((s) => s.hydrate);
  const setUser = useSession((s) => s.setUser);
  const signOut = useSession((s) => s.signOut);
  const segments = useSegments();

  // Boot (once): restore the saved token, then prove it's still valid via /auth/me.
  useEffect(() => {
    let alive = true;
    (async () => {
      await hydrate(); // token → store, or straight to `guest`
      // Read fresh — the render-time closure would be stale after the await.
      const token = useSession.getState().token;
      if (!token) return; // no token → hydrate already set `guest`
      try {
        const me = await get<IUser>("/auth/me");
        if (alive) setUser(me); // → authed
      } catch {
        await signOut(); // expired / invalid → back to `guest`
      }
    })();
    return () => {
      alive = false;
    };
  }, [hydrate, setUser, signOut]);

  // Splash: hold it until boot decides, so the correct group is the first paint.
  useEffect(() => {
    if (status !== "loading") SplashScreen.hideAsync();
  }, [status]);

  // Categories follow the session: load the user's set once they're authed
  // (covers both boot-with-token and a fresh login), clear it on sign-out.
  useEffect(() => {
    if (status === "authed") {
      useCategoryStore.getState().load();
      useAccountStore.getState().load();
    }
    else if (status === "guest") {
      useCategoryStore.getState().reset();
      useAccountStore.getState().reset();
    } 
  }, [status]);

  // The gate — the only place the app swaps between (auth) and (tabs).
  useEffect(() => {
    if (status === "loading") return; // boot not done → do nothing yet
    const inAuth = segments[0] === "(auth)";
    if (status === "guest" && !inAuth) router.replace("/(auth)/login");
    else if (status === "authed" && inAuth) router.replace("/(tabs)");
  }, [status, segments]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
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
      </QueryClientProvider>
    </GestureHandlerRootView>
  )
}

export default RootLayout;
