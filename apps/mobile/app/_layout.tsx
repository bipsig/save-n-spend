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
import KeyboardDoneBar from "@/components/ui/KeyboardDoneBar";
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

  // Device-local settings, read once at boot. Outside the session effect because it gates
  // the lock overlay, which must decide before the first paint.
  useEffect(() => {
    void useSettings.getState().hydrate();
  }, []);

  // Is the server even up? First and unconditional, so it runs in parallel with the
  // SecureStore read below. See store/wake.
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
      // Held until the server answers, or `/auth/me` is the request that pays for the
      // cold start, times out, and throws away a perfectly good token.
      await useWake.getState().probe();

      // A saved token is only discarded because the server ANSWERED and refused it. No
      // signal, a gateway error, an instance still coming up: none of those say the token
      // is bad, so each buys one more attempt behind a fresh probe.
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
      // Open the gate before signing out, or the unreachable screen sits on top of the
      // login screen we are sending them to.
      useWake.getState().proceedAnyway();
      await signOut(); // expired, invalid, or unreachable twice → back to `guest`
    })();
    return () => {
      alive = false;
    };
  }, [hydrate, setUser, signOut]);

  // Held until there is something to replace it with, so the first paint is never blank.
  // If the server is asleep that something is WakeGate's screen, which cannot be seen from
  // behind the splash.
  const ready = wakePhase === "probing" ? false : wakePhase === "awake" ? status !== "loading" : true;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // The stores follow the session, covering both boot-with-token and a fresh login. The
  // notification feed is loaded here because the bell's unread dot is painted from it on
  // every screen; the push token is re-sent on every authed launch, which is how a
  // reinstall or an OS-reissued token gets picked up.
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

  // Mounted for as long as the session lasts. Gated on `authed` because every route they
  // can open is behind the gate.
  useNotificationBridge(status === "authed");

  // The gate — the only place the app swaps between (auth) and (tabs).
  useEffect(() => {
    if (status === "loading") return; // boot not done → do nothing yet
    // WakeGate renders in place of the Stack, so until it opens there is no navigator to
    // navigate — `hydrate()` can settle to `guest` while the server is still waking.
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
            {/* Inside the providers for the safe area and gesture context, outside the
                Stack so it covers every route. */}
            <AppLockGate>
              {/* Inside the lock gate, not around it: coming up locked while the server
                  wakes, the lock has to be the thing on top. */}
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
          {/* Outside BottomSheetModalProvider on purpose: gorhom renders its portal host
              after that provider's children, so anything inside sits under an open sheet —
              and a save that fails while a sheet is up is when the message must be read.
              Still inside SafeAreaProvider, where it gets its inset. */}
          <Toast />
          {/* Outside the sheet provider for the same reason as Toast — a peek started
              from an amount inside a sheet still has to show its clock. */}
          <PeekBar />
          {/* Mounted once for the whole app: iOS resolves `inputAccessoryViewID` by id, so
              one instance serves every field. It draws nothing until a field that asks for
              it has focus. */}
          <KeyboardDoneBar />
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  )
}

export default RootLayout;
