import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import type { AppStateStatus } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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

// The lock screen renders OVER the app rather than replacing it, so unlocking
// puts the user back exactly where they were — a navigation swap would drop them
// on the home tab and lose the screen they had open.
//
// Only an authed session is worth locking: the login screen has nothing behind it.
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
  // The biometric prompt itself pushes the app to `inactive`. Without this flag
  // that transition would be read as "the user left", re-arming the lock and
  // prompting again the moment the prompt is dismissed.
  const promptingRef = useRef(false);

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
      // Nothing on success: the app snapping back to the screen the user left is
      // the loudest possible confirmation, and Face ID has already given its own.
      // A failure is the opposite — the prompt vanishes and the lock screen looks
      // exactly as it did, so without this the only evidence is a line of small
      // grey text the user has no reason to re-read.
      haptics.error();
      setFailed(true);
    }
  }, []);

  // Whether the cold-start decision has been made. Made exactly once per launch, which
  // is what lets this effect watch `status` and `appLock` without ever locking the app
  // again afterwards.
  const armedAtBoot = useRef(false);

  // Cold start with the lock on: come up locked, so the first paint after the splash is
  // the lock screen and not a flash of the user's balances.
  //
  // Waits for BOTH halves of boot, which is the bug this used to have. Keyed on
  // `hydrated` alone, it fired the moment settings came back from AsyncStorage — a local
  // read that always beats `/auth/me` over the network — so `status` was still "loading",
  // the condition failed, and nothing ever re-ran it. App Lock worked on every return
  // from the background and never once on a cold start.
  //
  // The naive fix of adding `status` to the deps locks the app again immediately after a
  // fresh login, since that is also a transition into "authed". `armedAtBoot` is what
  // separates the two: by the time someone reaches the login screen, boot has already
  // resolved to "guest" and the decision is spent. It also preserves the original
  // intent — switching the toggle on from Settings must not lock the screen the user is
  // standing on — even though `appLock` is now in the deps.
  useEffect(() => {
    if (armedAtBoot.current) return;
    if (!hydrated || status === "loading") return;

    armedAtBoot.current = true;
    if (appLock && status === "authed") setLocked(true);
  }, [hydrated, status, appLock]);

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

      // Back in the foreground: lock if it was away at least as long as the
      // chosen delay. `0` (Immediately) locks on any trip out of the app.
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
    // autoLockSeconds is read through getState() above, so the listener never
    // needs rebinding — it is only in the deps to document the dependency.
  }, [autoLockSeconds]);

  // Prompt as soon as the overlay goes up: the expected flow is "raise the phone,
  // it unlocks", not "raise the phone, then tap Unlock".
  useEffect(() => {
    if (locked && !failed) void unlock();
  }, [locked, failed, unlock]);

  return (
    <View style={styles.fill}>
      {children}
      {locked && (
        // Deliberately not faded in, unlike every other appearing surface in the
        // app: a fade is a few frames of the user's balances showing through a
        // half-opaque overlay, which is the one thing this screen exists to prevent.
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
