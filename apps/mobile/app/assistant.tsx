import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { IHighlight } from "@save-n-spend/types";
import BackButton from "@/components/shell/BackButton";
import PeekButton from "@/components/shell/PeekButton";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import { AppText } from "@/components/ui/AppText";
import Badge from "@/components/ui/Badge";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import SkeletonState from "@/components/states/SkeletonState";
import { SCREEN_ROUTE, SEVERITY_COLOR, SEVERITY_ICON, SEVERITY_LABEL, useHighlights } from "@/lib/highlights";
import { haptics } from "@/lib/haptics";
import { radius, spacing } from "@/theme";

// Highlights — what the charts don't say out loud.
//
// Every card is a sentence the server computed from this account's own numbers:
// a budget's pace, a bill against the balance meant to pay it, a category running
// hot. Deterministic rules, ranked by the rupees at stake, at most four — see
// docs/insights-engine.md for the rule set and why there is no model behind this.
// The screen renders and routes; it never judges.

/** Severity → Badge status, so the chip wears the palette Badge already owns. */
const SEVERITY_BADGE = {
  urgent: "overdue",
  warning: "pending",
  notice: "onTrack",
  win: "paid",
} as const;

const HighlightCard = ({ highlight, onDismiss }: { highlight: IHighlight; onDismiss: (key: string) => void }) => {
  const open = () => {
    if (!highlight.screen) return;
    haptics.tap();
    router.push(SCREEN_ROUTE[highlight.screen] as never);
  };

  return (
    // The whole card opens the screen where something can be done about it — a
    // highlight that names a problem without offering the door is half a feature.
    <PressableScale onPress={open} scaleTo={0.98} haptic={false}>
      <Card style={styles.card}>
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

const AssistantScreen = () => {
  const { highlights, allDismissed, warmingUp, loading, error, refetch, dismiss } = useHighlights();

  const header = (
    <View style={styles.head}>
      <BackButton />
      <AppText size="xl" weight="black" style={styles.headTitle}>
        Highlights
      </AppText>
      <PeekButton />
    </View>
  );

  if (error) {
    return (
      <ScreenScaffold header={header}>
        <ErrorState message={error} onRetry={refetch} />
      </ScreenScaffold>
    );
  }

  if (loading) {
    return (
      <ScreenScaffold header={header}>
        <View style={styles.skeletonCol}>
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonState key={i} height={110} borderRadius={radius.lg} />
          ))}
        </View>
      </ScreenScaffold>
    );
  }

  // Too new to compare against — an honest wait beats a verdict on two weeks.
  if (warmingUp) {
    return (
      <ScreenScaffold header={header}>
        <EmptyState icon="clock" title="Warming up" subtitle={warmingUp} />
      </ScreenScaffold>
    );
  }

  if (highlights.length === 0) {
    return (
      <ScreenScaffold header={header}>
        <EmptyState
          icon="budgetOk"
          title={allDismissed ? "All caught up" : "All clear"}
          subtitle={
            allDismissed
              ? "You've waved away everything current. Anything still true resurfaces in a week."
              // Saying nothing is a valid good answer — padding this screen with weak
              // observations is how it would teach you to stop reading it.
              : "Nothing needs your attention — spending is tracking where it usually does. New highlights appear as the month develops."
          }
        />
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold header={header}>
      <AppText size="xs" color="inkDim">
        What your money is doing that the charts don't say out loud, ranked by the
        amount at stake.
      </AppText>

      {highlights.map((highlight) => (
        <HighlightCard key={highlight.key} highlight={highlight} onDismiss={dismiss} />
      ))}

      <AppText size="xs" color="inkDim" style={styles.foot}>
        Computed from your own numbers every time you open this — nothing here is
        advice, and nothing here can change your data.
      </AppText>
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headTitle: {
    flex: 1,
  },
  skeletonCol: {
    gap: spacing.lg,
  },
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
  foot: {
    textAlign: "center",
    lineHeight: 16,
  },
});

export default AssistantScreen;
