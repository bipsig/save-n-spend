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
        ? <Text key={i} onPress={onPeek} suppressHighlighting>{MASKED_MONEY}</Text>
        : p.text))}
    </AppText>
  );
};

export default MaskedText;
