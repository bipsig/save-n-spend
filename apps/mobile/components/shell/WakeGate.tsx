import { ActivityIndicator, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppText } from "@/components/ui/AppText";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import GlowBackground from "./GlowBackground";
import { colors, spacing } from "@/theme";
import { useWake } from "@/store/wake";

type Props = { children: React.ReactNode };

// The cold-start gate. See store/wake for the probe itself.
//
// The server sleeps when nobody is using it, and the first request after that waits the
// better part of a minute for it to boot. What the user saw before this screen existed
// was the app's ordinary failure surface — a login that hung, then error states on every
// tab — which reads as a broken app rather than a sleeping server. Those are very
// different pieces of news and only one of them is true.
//
// Three deliberate choices about what this does NOT do:
//
//   • It does not appear for a warm server. Nothing is rendered during the first probe;
//     the splash screen is still up, and a server that answers in 300ms is never made to
//     look slow by a spinner that flickers past.
//   • It replaces, rather than overlays, the app. Unlike AppLockGate there is nothing
//     underneath worth preserving — no route has loaded yet.
//   • It can always be escaped. A gate with no way out is a worse bug than the cold
//     start it was hiding, so a long wait offers a way past it and a failed one insists.
const WakeGate = ({ children }: Props) => {
  const phase = useWake((s) => s.phase);
  const attempt = useWake((s) => s.attempt);
  const retry = useWake((s) => s.retry);
  const proceedAnyway = useWake((s) => s.proceedAnyway);

  if (phase === "awake") return <>{children}</>;

  // Still in the first attempt: hold everything back but paint nothing. The splash is
  // covering this, and swapping it for a spinner would be two loading screens in a row.
  if (phase === "probing") return null;

  const failed = phase === "unreachable";

  // Past forty seconds, which is past a normal cold start (measured: ~33s). Deliberately
  // not sooner — an escape hatch offered while the expected wait is still running invites
  // people to bail out ten seconds before it would have worked.
  const dragging = attempt >= 6;

  return (
    <LinearGradient
      colors={["#151129", "#0C0A16"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.fill}
    >
      <GlowBackground />
      <View style={styles.center}>
        <Icon
          name={failed ? "cloudOff" : "cloudSync"}
          size={34}
          containerSize={78}
          containerRadius={26}
          container="square"
          gradient={failed ? "red" : "accent"}
        />

        <AppText size="xl" weight="black">
          {failed ? "Can't reach the server" : "Waking things up"}
        </AppText>

        {/* Named plainly, because "the server was asleep" is a reason a person accepts
            and "something went wrong" is not. Saying it once here also means no screen
            behind the gate has to apologise for the first slow request. */}
        <AppText size="sm" color="inkDim" style={styles.blurb}>
          {failed
            ? "It is either still starting up or the connection dropped — from here those look the same. Try again, or carry on and the app will keep retrying as you go."
            : "The server goes to sleep when nobody is using it. Getting it back on its feet takes up to a minute, and only the first visit of the day pays for it."}
        </AppText>

        {!failed && (
          <View style={styles.waiting}>
            <ActivityIndicator color={colors.primary} />
            {/* The count is here so a long wait still looks like progress. A spinner
                alone is indistinguishable from a spinner that has stopped meaning
                anything, and this is a wait long enough for that to matter. */}
            <AppText size="xs" color="inkDim">
              {attempt <= 1 ? "Knocking…" : `Still knocking · try ${attempt}`}
            </AppText>
          </View>
        )}

        {failed && (
          <View style={styles.action}>
            <Button label="Try again" onPress={() => void retry()} />
          </View>
        )}

        {(failed || dragging) && (
          <Button
            label="Continue anyway"
            variant="ghost"
            size="sm"
            pill
            onPress={proceedAnyway}
          />
        )}
      </View>
    </LinearGradient>
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
    maxWidth: 300,
    lineHeight: 20,
  },
  waiting: {
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  action: {
    alignSelf: "stretch",
    marginTop: spacing.xs,
  },
});

export default WakeGate;
