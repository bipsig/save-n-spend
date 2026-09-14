import { StyleSheet, View } from "react-native";
import BackButton from "@/components/shell/BackButton";
import PeekButton from "@/components/shell/PeekButton";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import HighlightCard from "@/components/data/HighlightCard";
import { AppText } from "@/components/ui/AppText";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import SkeletonState from "@/components/states/SkeletonState";
import { useHighlights } from "@/lib/highlights";
import { radius, spacing } from "@/theme";

// Highlights — what the charts don't say out loud.
//
// Every card is a sentence the server computed from this account's own numbers:
// a budget's pace, a bill against the balance meant to pay it, a category running
// hot. Deterministic rules, ranked by the rupees at stake, at most four — see
// docs/insights-engine.md for the rule set and why there is no model behind this.
// The screen renders and routes; it never judges. The card itself lives in
// components/data/HighlightCard.tsx, shared with the preview embedded on Insights.

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
  foot: {
    textAlign: "center",
    lineHeight: 16,
  },
});

export default AssistantScreen;
