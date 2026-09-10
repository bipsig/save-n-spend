import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { LinearTransition } from "react-native-reanimated";
import { AppText } from "../ui/AppText";
import Icon from "../ui/Icon";
import PressableScale from "../ui/PressableScale";
import ProgressBar from "./ProgressBar";
import type { OnboardingProgress, OnboardingStep } from "@/lib/onboarding";
import { radius, spacing } from "@/theme";

type Props = {
  progress: OnboardingProgress
  onStepPress: (step: OnboardingStep) => void
  onDismiss: () => void
};

// One row per step. A done row is deliberately quiet — dimmed, struck through, and
// not pressable: it is there to be counted, not to be tapped again. An open row keeps
// its colour and its chevron, so the eye lands on what is left rather than on what is
// finished.
const StepRow = ({
  step,
  expanded,
  onPress,
}: {
  step: OnboardingStep
  expanded: boolean
  onPress: () => void
}) => {
  const body = (
    <View style={styles.stepRow}>
      {step.done ? (
        <View style={styles.tick}>
          <Icon name="check" size={14} color="success" />
        </View>
      ) : (
        <Icon
          name={step.icon}
          size={15}
          containerSize={28}
          containerRadius={9}
          container="square"
          gradient={step.tint}
        />
      )}

      <View style={styles.stepText}>
        <AppText
          size="sm"
          weight={step.done ? "medium" : "bold"}
          color={step.done ? "inkDim" : "ink"}
          style={step.done ? styles.struck : undefined}
        >
          {step.label}
        </AppText>
        {/* Only the next open step explains itself. Five hints at once is a wall of
            text on the first screen the user ever sees; one is a suggestion. */}
        {expanded && (
          <AppText size="xs" color="inkDim" style={styles.hint}>
            {step.hint}
          </AppText>
        )}
      </View>

      {!step.done && <Icon name="chevronRight" size={18} color="inkDim" />}
    </View>
  );

  if (step.done) return body;

  return (
    <PressableScale onPress={onPress} scaleTo={0.985}>
      {body}
    </PressableScale>
  );
};

/**
 * The dashboard's first-run card.
 *
 * A checklist and not a tour, because it does two jobs: it fills the hole where a new account's
 * dashboard has nothing to show, and it teaches the five things worth setting up by having the
 * user do them. Ticks are derived from real data (see `lib/onboarding`), so it cannot
 * congratulate the user for something they have not done, or nag about something they have.
 *
 * Same violet gradient as the Highlights hero on More, being the same kind of thing: the one
 * row on the screen asking to be tapped.
 */
const GetStartedCard = ({ progress, onStepPress, onDismiss }: Props) => {
  return (
    <Animated.View layout={LinearTransition.duration(220)} style={styles.card}>
      <LinearGradient
        colors={["rgba(139,123,255,0.30)", "rgba(109,92,246,0.10)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.head}>
        <Icon name="star" size={20} containerSize={40} container="square" gradient="violet" />
        <View style={styles.headText}>
          <AppText size="sm" weight="black">
            Get started
          </AppText>
          <AppText size="xs" color="inkDim">
            {/* The count is the reassurance: it says the list is short and it is
                already moving, which is what gets someone to finish it. */}
            {progress.completed} of {progress.total} done · about 2 minutes
          </AppText>
        </View>
      </View>

      <ProgressBar value={progress.percent} height={7} />

      <View style={styles.steps}>
        {progress.steps.map((step) => (
          <StepRow
            key={step.key}
            step={step}
            expanded={step.key === progress.next?.key}
            onPress={() => onStepPress(step)}
          />
        ))}
      </View>

      {/* Not a button — a quiet opt-out. Somebody who never wants a budget should be
          able to clear this off their dashboard without it feeling like giving up, and
          without it competing with the steps for attention. */}
      <PressableScale onPress={onDismiss} scaleTo={0.97}>
        <View style={styles.dismiss}>
          <AppText size="xs" weight="semibold" color="inkDim">
            Hide this
          </AppText>
        </View>
      </PressableScale>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: 18,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(163,148,255,0.4)",
    overflow: "hidden",
    shadowColor: "#6D5CFF",
    shadowOpacity: 0.25,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headText: {
    flex: 1,
    gap: 3,
  },
  steps: {
    gap: spacing.xs,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: spacing.sm,
  },
  stepText: {
    flex: 1,
    gap: 3,
  },
  struck: {
    textDecorationLine: "line-through",
  },
  hint: {
    lineHeight: 16,
  },
  // Matches the 28pt icon chip an open row uses, so the labels form one column
  // whether their row is ticked or not.
  tick: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(52,224,161,0.16)",
  },
  dismiss: {
    alignSelf: "flex-end",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
});

export default GetStartedCard;
