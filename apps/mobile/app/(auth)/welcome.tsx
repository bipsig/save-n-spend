import { useRef, useState } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/ui/AppText";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import GlowBackground from "@/components/shell/GlowBackground";
import { haptics } from "@/lib/haptics";
import type { IconName } from "@/lib/icons";
import type { ChipTint } from "@/theme";
import { colors, radius, spacing } from "@/theme";

// Shown once, immediately after registration and before the first sign-in.
//
// That placement is deliberate. Registration does not open a session — it routes to
// Login — so there is no "first authed launch" to hang a tour off without storing a
// flag, and a stored flag would either miss a reinstall or fire for existing users
// after an update. Coming straight off the Create-account button it needs no state at
// all: the event happens exactly once per account, in the one moment the user is most
// willing to read three sentences about what they just signed up for.
//
// It also does a job the old success toast was doing badly. Login looks identical to
// the form the user just submitted, so replacing one with the other read as if the tap
// had failed. This confirms the account exists before asking them to sign in.

type Slide = {
  key: string
  icon: IconName
  tint: ChipTint
  title: string
  body: string
};

const SLIDES: Slide[] = [
  {
    key: "track",
    icon: "wallet",
    tint: "violet",
    title: "Every rupee, in one place",
    body:
      "Log what comes in and what goes out — cash, bank, cards. Accounts and categories are already set up, so you can record your first spend in about ten seconds.",
  },
  {
    key: "understand",
    icon: "insights",
    tint: "blue",
    title: "See where it actually goes",
    body:
      "Budgets warn you before you overspend, not after. Trends show the categories quietly eating your month, and a health score sums it all up in one number.",
  },
  {
    key: "goals",
    icon: "savings",
    tint: "green",
    title: "Save for what matters",
    body:
      "Set a goal, watch it fill. Add your bills once and the app reminds you before each due date — so nothing is ever a surprise.",
  },
  {
    key: "private",
    icon: "lock",
    tint: "teal",
    title: "Yours, and private",
    body:
      "Face ID can lock the app, and privacy mode hides every amount until you tap it. No ads, no selling your data, and nothing to pay — ever.",
  },
];

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const WelcomeScreen = () => {
  const { top, bottom } = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<Animated.ScrollView>(null);

  const isLast = index === SLIDES.length - 1;

  // Derived from the scroll offset rather than from the button, so a swipe and a tap
  // can never leave the dots disagreeing with the slide on screen.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (next !== index && next >= 0 && next < SLIDES.length) {
      setIndex(next);
      haptics.select();
    }
  };

  const finish = () => router.replace("/(auth)/login");

  const advance = () => {
    if (isLast) {
      finish();
      return;
    }
    scrollRef.current?.scrollTo({ x: (index + 1) * SCREEN_WIDTH, animated: true });
  };

  return (
    <LinearGradient
      colors={["#151129", "#0C0A16"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.fill}
    >
      <GlowBackground />

      <View style={[styles.inner, { paddingTop: top + spacing.lg, paddingBottom: bottom + spacing.lg }]}>
        {/* Skip stays reachable on every slide. A tour you cannot leave is a gate, and
            somebody who already knows what a budget is should not have to swipe past
            four screens to sign in. */}
        <View style={styles.topBar}>
          <View style={styles.badge}>
            <Icon name="check" size={13} color="success" />
            <AppText size="xs" weight="semibold" color="success">
              Account created
            </AppText>
          </View>
          <PressableScale onPress={finish} scaleTo={0.95}>
            <View style={styles.skip}>
              <AppText size="xs" weight="semibold" color="inkDim">
                Skip
              </AppText>
            </View>
          </PressableScale>
        </View>

        {/* Paged horizontally rather than swapped in place: the swipe is the affordance
            that says there is more than one of these, and it costs nothing here — four
            slides of static text are cheap enough to mount at once. */}
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={styles.pager}
        >
          {SLIDES.map((slide) => (
            <View key={slide.key} style={[styles.slide, { width: SCREEN_WIDTH }]}>
              <Icon
                name={slide.icon}
                size={44}
                containerSize={104}
                containerRadius={34}
                container="square"
                gradient={slide.tint}
                glow
              />
              <View style={styles.copy}>
                <AppText size="xl" weight="black" style={styles.centered}>
                  {slide.title}
                </AppText>
                <AppText size="sm" color="inkSecondary" style={styles.body}>
                  {slide.body}
                </AppText>
              </View>
            </View>
          ))}
        </Animated.ScrollView>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {SLIDES.map((slide, i) => (
              <View key={slide.key} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>

          {/* One button whose label changes, not two that swap places. The tap target
              stays exactly where the thumb learned it was on the first slide. */}
          <Button
            label={isLast ? "Sign in to get started" : "Next"}
            variant="primary"
            size="md"
            onPress={advance}
          />

          {isLast && (
            <Animated.View entering={FadeIn.duration(200)}>
              <AppText size="xs" color="inkDim" style={styles.centered}>
                You&apos;ll find a short setup checklist waiting on your dashboard.
              </AppText>
            </Animated.View>
          )}
        </View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  inner: {
    flex: 1,
    gap: spacing.lg,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.successSoft,
  },
  skip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  pager: {
    flex: 1,
  },
  // Padding lives on the slide, not the pager: the pager has to be exactly one screen
  // wide for `pagingEnabled` to land on a slide boundary.
  slide: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing["2xl"],
    paddingHorizontal: spacing.xl,
  },
  copy: {
    gap: spacing.md,
  },
  centered: {
    textAlign: "center",
  },
  body: {
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 320,
  },
  footer: {
    gap: spacing.lg,
    paddingHorizontal: 20,
  },
  dots: {
    flexDirection: "row",
    alignSelf: "center",
    gap: spacing.sm,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.line,
  },
  // Widened rather than only recoloured — the active dot stays findable for anyone who
  // cannot pick violet out from a dim grey.
  dotActive: {
    width: 22,
    backgroundColor: colors.primary,
  },
});

export default WelcomeScreen;
