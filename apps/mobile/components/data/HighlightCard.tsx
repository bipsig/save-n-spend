import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { IHighlight } from "@save-n-spend/types";
import Card from "@/components/data/Card";
import { AppText } from "@/components/ui/AppText";
import Badge from "@/components/ui/Badge";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import { SCREEN_LABEL, SCREEN_ROUTE, SEVERITY_COLOR, SEVERITY_ICON, SEVERITY_LABEL } from "@/lib/highlights";
import { haptics } from "@/lib/haptics";
import { spacing } from "@/theme";

// Shared by /assistant (its dedicated screen) and Insights (an embedded preview of the same
// list) — one card, so the two never render a highlight differently from each other.

/** Severity → Badge status, so the chip wears the palette Badge already owns. */
const SEVERITY_BADGE = {
  urgent: "overdue",
  warning: "pending",
  notice: "onTrack",
  win: "paid",
} as const;

type Props = {
  highlight: IHighlight;
  onDismiss: (key: string) => void;
  /** Set only by the dashboard's "For You" carousel, where several unrelated cards sit
   *  side by side and need to read as one consistent shelf. Unset everywhere else
   *  (/assistant, Insights' own preview), where this card sizes to its own content
   *  same as always. */
  minHeight?: number;
};

const HighlightCard = ({ highlight, onDismiss, minHeight }: Props) => {
  const open = () => {
    if (!highlight.screen) return;
    haptics.tap();
    // The recurring-payments card opens its review list directly, not just the Bills screen.
    router.push((highlight.ruleId === "recurring_found" ? "/bills?suggestions=1" : SCREEN_ROUTE[highlight.screen]) as never);
  };

  // Money already sits inside `body`/`title` as formatted, privacy-aware text (the rules
  // engine renders its own copy) — nothing here needs its own formatMoney() call.
  const label = `${SEVERITY_LABEL[highlight.severity]}: ${highlight.title}. ${highlight.body}`
    + (highlight.screen ? ` Opens ${SCREEN_LABEL[highlight.screen]}.` : "");

  return (
    // The whole card opens the screen where something can be done about it — a
    // highlight that names a problem without offering the door is half a feature.
    <PressableScale
      onPress={open}
      scaleTo={0.98}
      haptic={false}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Card style={[styles.card, minHeight !== undefined && { minHeight }]}>
        <View style={styles.cardHead}>
          <Icon
            name={SEVERITY_ICON[highlight.severity]}
            size={16}
            containerSize={32}
            containerRadius={10}
            container="square"
            containerColor="surface2"
            color={SEVERITY_COLOR[highlight.severity]}
          />
          <Badge label={SEVERITY_LABEL[highlight.severity]} status={SEVERITY_BADGE[highlight.severity]} size="sm" />
          <View style={styles.spacer} />
          {/* Wave it away for a week. Device-local: the server never learns, and a
              card that still fires next week has earned its second look. */}
          <PressableScale
            onPress={() => {
              haptics.tap();
              onDismiss(highlight.key);
            }}
            scaleTo={0.9}
            haptic={false}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Dismiss for a week"
          >
            <Icon name="close" size={16} color="inkDim" />
          </PressableScale>
        </View>

        <AppText size="sm" weight="bold" style={styles.title}>
          {highlight.title}
        </AppText>
        <AppText size="xs" color="inkDim" style={styles.body}>
          {highlight.body}
        </AppText>
      </Card>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  spacer: {
    flex: 1,
  },
  title: {
    lineHeight: 20,
  },
  body: {
    lineHeight: 17,
  },
});

export default HighlightCard;
