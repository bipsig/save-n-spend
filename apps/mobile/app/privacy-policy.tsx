import { StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import BackButton from "@/components/shell/BackButton";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import type { IconName } from "@/lib/icons";
import type { ChipTint } from "@/theme/gradients";
import { spacing } from "@/theme";

type Section = {
  title: string;
  icon: IconName;
  tint: ChipTint;
  /** Each paragraph a claim the app can actually keep. */
  body: string[];
};

// Written from what the code does, not from a template: every claim here maps to
// a specific behaviour — the User.toJSON transform, the device-local settings
// store, the transactional account delete.
const SECTIONS: Section[] = [
  {
    title: "What we store",
    icon: "bank",
    tint: "blue",
    body: [
      "Your name, email, and the money data you enter: accounts, transactions, categories, budgets, bills, and goals. That's it — we don't ask for a phone number, an address, or a date of birth, because none of them make the app work.",
      "We never connect to your bank. Every figure in the app is one you typed, which is also why nothing here can be read from your bank without you.",
    ],
  },
  {
    title: "Your password",
    icon: "key",
    tint: "amber",
    body: [
      "Stored only as a bcrypt hash, which cannot be reversed into the password itself. Nobody — including us — can read it.",
      "It is never included in any response the app receives, even when the app asks for your own profile.",
    ],
  },
  {
    title: "What stays on your phone",
    icon: "fingerprint",
    tint: "violet",
    body: [
      "App Lock, auto-lock timing, and privacy mode are device settings. They are written to your device's secure storage and never sent to our server, so they protect this phone rather than your account.",
      "Face ID and fingerprint data belong to your phone. The app only ever receives a yes or no from it, and never sees the biometric itself.",
      "Your sign-in token is also kept in secure storage, not in ordinary app storage.",
    ],
  },
  {
    title: "Who else sees it",
    icon: "policy",
    tint: "green",
    body: [
      "Nobody. There is no analytics SDK, no advertising, no third-party tracker, and no sale or sharing of your data.",
      "The only time your data leaves the app is when you export it — and then it goes exactly where you send it through your phone's share sheet.",
    ],
  },
  {
    title: "Deleting your account",
    icon: "delete",
    tint: "red",
    body: [
      "Deleting your account removes your profile and every transaction, budget, bill, goal, account, and category attached to it. It runs as a single operation, so it either completes fully or changes nothing.",
      "It is not a soft delete and there is no recovery window. Export anything you want to keep first.",
    ],
  },
];

const PrivacyPolicyScreen = () => (
  <ScreenScaffold
    header={
      <View style={styles.head}>
        <BackButton />
        <AppText size="xl" weight="black">
          Privacy policy
        </AppText>
      </View>
    }
  >
    <AppText size="sm" color="inkDim" style={styles.intro}>
      Save n Spend holds the numbers people are least likely to want loose. This is
      the whole of what it does with them.
    </AppText>

    {/* Staggered in rather than appearing at once. This screen is five dense cards
        of text; arriving in sequence gives the eye a starting point and makes the
        page feel like it is being handed over instead of dumped. */}
    {SECTIONS.map((section, i) => (
      <Animated.View key={section.title} entering={FadeInDown.delay(i * 60).duration(260)}>
        <Card style={styles.section}>
          <View style={styles.sectionHead}>
            <Icon
              name={section.icon}
              size={17}
              containerSize={34}
              containerRadius={11}
              container="square"
              gradient={section.tint}
            />
            <AppText size="sm" weight="bold">
              {section.title}
            </AppText>
          </View>
          {section.body.map((paragraph) => (
            <AppText key={paragraph} size="xs" color="inkSecondary" style={styles.paragraph}>
              {paragraph}
            </AppText>
          ))}
        </Card>
      </Animated.View>
    ))}

    <AppText size="xs" color="inkDim" style={styles.footer}>
      Questions about any of this: sagnik.rik.das@gmail.com
    </AppText>
  </ScreenScaffold>
);

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  intro: {
    lineHeight: 21,
    paddingHorizontal: 2,
  },
  section: {
    gap: spacing.md,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  paragraph: {
    lineHeight: 19,
  },
  footer: {
    textAlign: "center",
    lineHeight: 18,
    paddingBottom: spacing.md,
  },
});

export default PrivacyPolicyScreen;
