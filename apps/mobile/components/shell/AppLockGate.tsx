import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { AppState, Keyboard, Platform, StyleSheet, View } from "react-native";
import type { AppStateStatus } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { FullWindowOverlay } from "react-native-screens";
import { create } from "zustand";
import { AppText } from "@/components/ui/AppText";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import GlowBackground from "./GlowBackground";
import { haptics } from "@/lib/haptics";
import { authenticate } from "@/lib/lock";
import { useSession } from "@/store/session";
import { useSettings } from "@/store/settings";
import { spacing } from "@/theme";

type Props = { children: React.ReactNode };

/** Whether the lock screen is up, for anything that must wait until it's gone. `null` until
 *  this launch's boot decision is made, since the lock may still be about to go up. */
export const useAppLock = create<{ locked: boolean | null }>(() => ({ locked: null }));

// On iOS the lock draws in its own layer on the window. Drawn inline it would sit under the
// bottom-sheet portal and under native modal routes (Add transaction, Add goal), both of
// which are drawn after this tree.
const LockLayer: React.ElementType<{ children: React.ReactNode }> =
  Platform.OS === "ios" ? FullWindowOverlay : Fragment;

// The lock screen renders OVER the app rather than replacing it, so unlocking puts the user
// back where they were — a navigation swap would drop them on the home tab. Only an authed
// session is worth locking; the login screen has nothing behind it.
const AppLockGate = ({ children }: Props) => {
  const status = useSession((s) => s.status);
  const hydrated = useSettings((s) => s.hydrated);
  const appLock = useSettings((s) => s.appLock);
  const autoLockSeconds = useSettings((s) => s.autoLockSeconds);

  const [locked, setLocked] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const [failed, setFailed] = useState(false);

  // When the app last went to the background. `null` = it hasn't since launch.
  const backgroundedAt = useRef<number | null>(null);
  // The biometric prompt itself pushes the app to `inactive`, which would otherwise read
  // as "the user left" and re-prompt the moment the prompt is dismissed.
  const promptingRef = useRef(false);
  // Bumped on each return to the foreground, re-keying the layer so it is re-added on top of
  // the window: above anything presented since it went up, and attached at all if it first
  // mounted while iOS had no foreground window to give it (an app can launch before it shows).
  const [raised, setRaised] = useState(0);

  const unlock = useCallback(async () => {
    if (promptingRef.current) return;
    promptingRef.current = true;
    setPrompting(true);
    setFailed(false);

    const ok = await authenticate("Unlock Save n Spend");

    promptingRef.current = false;
    setPrompting(false);
    if (ok) {
      backgroundedAt.current = null;
      setLocked(false);
    }
    else {
      // Only on failure: the prompt vanishes and the lock screen looks unchanged, so
      // without this the only evidence is a line of small grey text.
      haptics.error();
      setFailed(true);
    }
  }, []);

  // Cold start with the lock on: come up locked, so the first paint after the splash is the
  // lock screen and not a flash of the user's balances.
  //
  // Must wait for BOTH halves of boot — settings hydrate from AsyncStorage well before
  // `/auth/me` returns, so keying on `hydrated` alone reads `status` as still "loading".
  // The decision is then spent for the launch, which is what stops a fresh login (also a
  // transition into "authed") or switching the toggle on from Settings from re-locking.
  const armedAtBoot = useRef(false);

  useEffect(() => {
    if (armedAtBoot.current) return;
    if (!hydrated || status === "loading") return;

    armedAtBoot.current = true;
    const lockNow = appLock && status === "authed";
    if (lockNow) setLocked(true);
    // Published here, in the same pass as the decision, so no reader sees "unlocked" for the
    // render before `locked` catches up.
    useAppLock.setState({ locked: lockNow });
  }, [hydrated, status, appLock]);

  useEffect(() => {
    if (armedAtBoot.current) useAppLock.setState({ locked });
  }, [locked]);

  // Turning the lock off, or signing out, clears any standing lock.
  useEffect(() => {
    if (!appLock || status !== "authed") setLocked(false);
  }, [appLock, status]);

  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (promptingRef.current) return;

      if (next === "background" || next === "inactive") {
        if (backgroundedAt.current === null) backgroundedAt.current = Date.now();
        return;
      }

      if (next === "active" && useSettings.getState().appLock) setRaised((n) => n + 1);

      // Lock if it was away at least as long as the chosen delay; `0` locks on any trip
      // out of the app.
      if (next === "active" && backgroundedAt.current !== null) {
        const away = (Date.now() - backgroundedAt.current) / 1000;
        backgroundedAt.current = null;
        if (useSettings.getState().appLock && away >= useSettings.getState().autoLockSeconds) {
          setLocked(true);
        }
      }
    };

    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
    // Read through getState() above, so the listener never needs rebinding — in the deps
    // only to document the dependency.
  }, [autoLockSeconds]);

  // Prompt as soon as the overlay goes up — the expected flow is "raise the phone, it
  // unlocks", not "raise the phone, then tap Unlock".
  useEffect(() => {
    if (locked && !failed) void unlock();
  }, [locked, failed, unlock]);

  // A focused field keeps its keyboard, which iOS draws above every layer of the app, and
  // keys typed into it would land in the form hidden behind the lock.
  useEffect(() => {
    if (locked) Keyboard.dismiss();
  }, [locked]);

  return (
    <View style={styles.fill}>
      {children}
      {locked && (
        <LockLayer key={raised}>
          {/* Not faded in, unlike every other appearing surface: a fade is a few frames of
              the user's balances showing through a half-opaque overlay. */}
          <LinearGradient
            colors={["#151129", "#0C0A16"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          >
            <GlowBackground />
            <View style={styles.center}>
              <Icon
                name="savings"
                size={34}
                containerSize={78}
                containerRadius={26}
                container="square"
                gradient="accent"
              />
              <AppText size="xl" weight="black">
                Save n Spend
              </AppText>
              <AppText size="sm" color="inkDim" style={styles.blurb}>
                {failed
                  ? "We couldn't verify it was you. Try again to see your money."
                  : "Locked. Verify it's you to continue."}
              </AppText>
              <View style={styles.action}>
                <Button
                  label={prompting ? "Verifying…" : "Unlock"}
                  loading={prompting}
                  onPress={unlock}
                />
              </View>
            </View>
          </LinearGradient>
        </LockLayer>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  blurb: {
    textAlign: "center",
    maxWidth: 260,
  },
  action: {
    alignSelf: "stretch",
    marginTop: spacing.md,
  },
});

export default AppLockGate;
