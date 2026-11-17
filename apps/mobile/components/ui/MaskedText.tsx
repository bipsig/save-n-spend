import type { ComponentProps } from "react";
import { Text } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { haptics } from "@/lib/haptics";
import { AMOUNT_HIDDEN, maskAmounts, splitAmounts } from "@/lib/maskAmounts";
import { MASKED_MONEY, usePrivacyMask } from "@/lib/money";
import { useSettings } from "@/store/settings";

type Props = Omit<ComponentProps<typeof AppText>, "children"> & {
  /** A finished sentence from the server, figures and all. */
  children: string;
};

// A server-written sentence under privacy mode: every rupee figure reads "₹ ••••" and the words
// and percentages stay. A peek shows the sentence as sent.
//
// Only the hidden figures take a tap, each starting a peek like `Money` does, so the rest of the
// sentence still passes taps to the row it sits in. VoiceOver reads the sentence with
// "amount hidden" in each figure's place; the screen's eye is how it peeks.
const MaskedText = ({ children, accessibilityLabel, ...rest }: Props) => {
  const masked = usePrivacyMask();
  const peek = useSettings((s) => s.peek);
  const parts = splitAmounts(children);

  if (!masked || !parts.some((p) => p.amount)) {
    return <AppText accessibilityLabel={accessibilityLabel} {...rest}>{children}</AppText>;
  }

  const onPeek = () => {
    haptics.toggle();
    peek();
  };

  return (
    <AppText {...rest} accessibilityLabel={maskAmounts(children, AMOUNT_HIDDEN)}>
      {parts.map((p, i) => (p.amount
        ? <Text key={i} onPress={onPeek} suppressHighlighting>{UNBROKEN_MASK}</Text>
        : p.text))}
    </AppText>
  );
};

/** Inside a wrapping sentence the mask's space would let "₹" and "••••" land on two lines. */
const UNBROKEN_MASK = MASKED_MONEY.replace(" ", "\u00A0");

export default MaskedText;

/** For an accessibility label built from server sentences: while masked, each figure reads
 *  "amount hidden". Subscribes to the mask, so a peek re-labels too. */
export const useMaskedLabel = (): ((sentence: string) => string) => {
  const masked = usePrivacyMask();
  return (sentence) => (masked ? maskAmounts(sentence, AMOUNT_HIDDEN) : sentence);
};
