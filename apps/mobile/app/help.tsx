import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import BackButton from "@/components/shell/BackButton";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import { haptics } from "@/lib/haptics";
import type { IconName } from "@/lib/icons";
import type { ChipTint } from "@/theme/gradients";
import { spacing } from "@/theme";

type Faq = {
  question: string;
  answer: string;
  icon: IconName;
  tint: ChipTint;
};

// The questions the app's own model actually raises — each answer states the rule
// the code follows, so the screen can't drift from the behaviour it describes.
const FAQS: Faq[] = [
  // First, and about starting rather than about a rule. The welcome tour lives behind
  // the sign-in screens and cannot be reopened from here, and the dashboard checklist
  // can be dismissed — so this is the one place a user who skipped both can still find
  // out what the app expects of them.
  {
    question: "I'm new — what should I set up first?",
    answer:
      "Five things, in this order: record one transaction, add your bank account under Accounts, cap one category with a budget, add a recurring bill, and set a savings goal. Your dashboard shows this as a checklist that ticks itself off as you go — and hides once you're done. You start with a Cash account and a full set of categories, so nothing is blocking you.",
    icon: "star",
    tint: "violet",
  },
  {
    question: "Why can't I edit an account's balance?",
    answer:
      "A balance isn't stored as a number you set — it's the opening balance plus every transaction since. Editing it directly would silently restate every total that depends on it. To correct one, add a transaction for the difference; the balance follows.",
    icon: "bank",
    tint: "blue",
  },
  {
    question: "What happens when I delete a category or account?",
    answer:
      "It's archived, not erased. It disappears from your pickers, but every transaction already filed under it keeps its name and history — so your past never changes shape because of a decision you made today.",
    icon: "delete",
    tint: "red",
  },
  {
    question: "What does the budget cycle day do?",
    answer:
      "It's the day your budget month starts over. Set it to your payday and a month of budget lines up with a month of income. It can be any day from the 1st to the 28th — later days would skip February.",
    icon: "date",
    tint: "violet",
  },
  {
    question: "What is privacy mode?",
    answer:
      "It replaces every amount on screen with ₹ •••• so you can open the app in public. It's a display setting on this device only — nothing about your data changes, and exports are never masked.",
    icon: "eyeOff",
    tint: "indigo",
  },
  {
    question: "Is App Lock the same as my password?",
    answer:
      "No. App Lock is Face ID or your fingerprint, checked by your phone when the app comes to the foreground, and it never leaves the device. Your password is what proves who you are to the server when you sign in.",
    icon: "fingerprint",
    tint: "amber",
  },
  {
    question: "How do transfers affect my totals?",
    answer:
      "A transfer moves money between two of your accounts, so it's neither income nor spending. Both balances change; your income and expense totals don't.",
    icon: "activity",
    tint: "teal",
  },
  {
    question: "What does exporting give me?",
    answer:
      "A CSV or PDF of the transactions in the span you pick, handed to your phone's share sheet — so you can mail it, save it to Files, or open it in a spreadsheet. Amounts in an export are always exact.",
    icon: "download",
    tint: "green",
  },
  {
    question: "What does deleting my account remove?",
    answer:
      "Everything: your profile and every transaction, budget, bill, goal, account, and category in it. It runs as one operation, so it either all goes or none of it does — and it cannot be undone.",
    icon: "logout",
    tint: "red",
  },
];

// One question. Collapsed by default so the page reads as a scannable list of
// questions rather than a wall of prose.
const FaqRow = ({ faq, first }: { faq: Faq; first: boolean }) => {
  const [open, setOpen] = useState(false);

  return (
    // Deliberately a plain Pressable, not PressableScale: the row inside already
    // animates its own resize, and a squeeze transform on top would fight that
    // layout tween. So it keeps the tick and skips the dip.
    <Pressable
      onPress={() => {
        haptics.tap();
        setOpen((o) => !o);
      }}
    >
      {/* The answer's height isn't known ahead of time, so `layout` tweens the
          row's own resize rather than us animating a measured value. */}
      <Animated.View
        layout={LinearTransition.duration(180)}
        style={[styles.row, !first && styles.divider]}
      >
        <View style={styles.question}>
          <Icon
            name={faq.icon}
            size={17}
            containerSize={34}
            containerRadius={11}
            container="square"
            gradient={faq.tint}
          />
          <AppText size="sm" weight="bold" style={styles.questionText}>
            {faq.question}
          </AppText>
          <Icon name={open ? "chevronDown" : "chevronRight"} size={18} color="inkDim" />
        </View>
        {open && (
          <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
            <AppText size="xs" color="inkSecondary" style={styles.answer}>
              {faq.answer}
            </AppText>
          </Animated.View>
        )}
      </Animated.View>
    </Pressable>
  );
};

const HelpScreen = () => (
  <ScreenScaffold
    header={
      <View style={styles.head}>
        <BackButton />
        <AppText size="xl" weight="black">
          Help & FAQ
        </AppText>
      </View>
    }
  >
    <Card padded={false} style={styles.group}>
      {FAQS.map((faq, i) => (
        <FaqRow key={faq.question} faq={faq} first={i === 0} />
      ))}
    </Card>

    <AppText size="xs" color="inkDim" style={styles.footer}>
      Still stuck? Email sagnik.rik.das@gmail.com and describe what you expected to
      happen — that&apos;s usually enough to find it.
    </AppText>
  </ScreenScaffold>
);

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  group: {
    paddingVertical: 2,
  },
  row: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    gap: spacing.sm,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  question: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  questionText: {
    flex: 1,
  },
  answer: {
    lineHeight: 19,
    paddingLeft: 34 + spacing.md, // align under the label, past the chip
  },
  footer: {
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: spacing.md,
  },
});

export default HelpScreen;
