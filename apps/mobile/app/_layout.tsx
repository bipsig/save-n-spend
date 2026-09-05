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
import { ApiError, get } from "@/lib/api";
import { registerForPush, useNotificationBridge } from "@/lib/push";
import AppLockGate from "@/components/shell/AppLockGate";
import PeekBar from "@/components/shell/PeekBar";
import Toast from "@/components/shell/Toast";
import WakeGate from "@/components/shell/WakeGate";
import { useWake } from "@/store/wake";
import { useSession } from "@/store/session";
import { useSettings } from "@/store/settings";
import { useCategoryStore } from "@/store/categories";
import { useAccountStore } from "@/store/accounts";
import { useNotifications } from "@/store/notifications";

SplashScreen.preventAutoHideAsync();

const RootLayout = () => {
  const status = useSession((s) => s.status);
  const hydrate = useSession((s) => s.hydrate);
  const setUser = useSession((s) => s.setUser);
  const signOut = useSession((s) => s.signOut);
  const segments = useSegments();
  const wakePhase = useWake((s) => s.phase);

  // Device-local settings, read once at boot. Kicked off outside the session
  // effect because it gates the lock overlay, which must decide before the first
  // paint — and it has nothing to do with whether there is a token.
  useEffect(() => {
    void useSettings.getState().hydrate();
  }, []);

  // Is the server even up? Started here, first and unconditionally, so it runs in
  // parallel with the SecureStore read below rather than after it. See store/wake.
  useEffect(() => {
    void useWake.getState().probe();
  }, []);

  // Boot (once): restore the saved token, then prove it's still valid via /auth/me.
  useEffect(() => {
    let alive = true;
    (async () => {
      await hydrate(); // token → store, or straight to `guest`
      // Read fresh — the render-time closure would be stale after the await.
      const token = useSession.getState().token;
      if (!token) return; // no token → hydrate already set `guest`
      // Held until the server answers. Without this, `/auth/me` is the request that
      // pays for the cold start, it times out, and a perfectly good token is thrown
      // away — the user reads a sleeping server as having been logged out.
      await useWake.getState().probe();

      // A saved token is only ever discarded because the server ANSWERED and refused it.
      // Anything else — no signal, a gateway error, an instance still coming up — says
      // nothing about whether the token is good, so it buys one more attempt behind a
      // fresh probe instead of costing the user their session.
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const me = await get<IUser>("/auth/me");
          if (alive) setUser(me); // → authed
          return;
        }
        catch (err) {
          const refused = err instanceof ApiError && (err.status === 401 || err.status === 403);
          if (refused) break;
          if (attempt === 2) break;
          await useWake.getState().retry(); // back behind the waking screen, then try again
        }
      }

      if (!alive) return;
      // Out of attempts. Open the gate before signing out, or the unreachable screen
      // would sit on top of the login screen we are sending them to.
      useWake.getState().proceedAnyway();
      await signOut(); // expired, invalid, or unreachable twice → back to `guest`
    })();
    return () => {
      alive = false;
    };
  }, [hydrate, setUser, signOut]);

  // Splash: hold it until there is something to replace it with, so the first paint is
  // never a blank frame. That is the boot decision in the normal case — but if the
  // server is asleep, WakeGate's screen is what comes next, and it cannot be seen from
  // behind the splash.
  const ready = wakePhase === "probing" ? false : wakePhase === "awake" ? status !== "loading" : true;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Categories follow the session: load the user's set once they're authed
  // (covers both boot-with-token and a fresh login), clear it on sign-out.
  //
  // The notification feed joins them: the bell's unread dot is painted from it on
  // every screen, so it can't wait for someone to open the alerts list. The push
  // token is registered here too, on every authed launch — it is stable, and
  // re-sending is how a reinstall or an OS-reissued token gets picked up.
  useEffect(() => {
    if (status === "authed") {
      useCategoryStore.getState().load();
      useAccountStore.getState().load();
      useNotifications.getState().load();
      void registerForPush();
    }
    else if (status === "guest") {
      useCategoryStore.getState().reset();
      useAccountStore.getState().reset();
      useNotifications.getState().reset();
    }
  }, [status]);

  // Listeners for notifications arriving and being tapped, mounted for as long as the
  // session lasts. Gated on `authed` because every route they can open is behind the gate.
  useNotificationBridge(status === "authed");

  // The gate — the only place the app swaps between (auth) and (tabs).
  useEffect(() => {
    if (status === "loading") return; // boot not done → do nothing yet
    // WakeGate renders in place of the Stack, so until it opens there is no navigator
    // to navigate: `hydrate()` can settle to `guest` while the server is still waking,
    // and a replace() at that moment would fire before the root layout has mounted.
    if (wakePhase !== "awake") return;
    const inAuth = segments[0] === "(auth)";
    if (status === "guest" && !inAuth) router.replace("/(auth)/login");
    else if (status === "authed" && inAuth) router.replace("/(tabs)");
  }, [status, segments, wakePhase]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <BottomSheetModalProvider>
            <StatusBar style="light" />
            {/* Inside the providers so the lock overlay gets the same safe area and
                gesture context, but outside the Stack so it covers every route. */}
            <AppLockGate>
              {/* Inside the lock gate, not around it: if the app comes up locked while
                  the server is still waking, the lock is the thing that has to be on
                  top — the wake screen is not private, but it must not be reachable
                  before the user has proved who they are. */}
              <WakeGate>
                <Stack screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: "#0C0A16" },
                }}
                >
                  <Stack.Screen name="add-transaction" options={{ presentation: "modal" }} />
                  <Stack.Screen name="add-goal" options={{ presentation: "modal" }} />
                </Stack>
              </WakeGate>
            </AppLockGate>
          </BottomSheetModalProvider>
          {/* Outside BottomSheetModalProvider on purpose. gorhom renders its portal
              host after that provider's children, so anything inside it sits under
              an open sheet — and a save that fails while a sheet is up is exactly
              when the message has to be readable. Still inside SafeAreaProvider,
              which is where it gets the inset it hangs from. */}
          <Toast />
          {/* Outside the sheet provider for the same reason as Toast: a peek
              started from an amount inside a sheet still has to show its clock. */}
          <PeekBar />
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  )
}

export default RootLayout;
