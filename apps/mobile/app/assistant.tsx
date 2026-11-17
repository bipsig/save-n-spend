import { StyleSheet, View } from "react-native";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import HighlightCard from "@/components/data/HighlightCard";
import HighlightHistoryRow from "@/components/data/HighlightHistoryRow";
import SectionHeader from "@/components/ui/SectionHeader";
import Button from "@/components/ui/Button";
import { AppText } from "@/components/ui/AppText";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import SkeletonState from "@/components/states/SkeletonState";
import ScreenStates from "@/components/states/ScreenStates";
import { useHighlights } from "@/lib/highlights";
import { useHighlightHistory } from "@/lib/highlightHistory";
import { groupIndian } from "@/lib/format/money";
import { mergeScreenStates } from "@/lib/screenStates";
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
  const live = useHighlights();
  const { highlights, allDismissed, warmingUp, dismiss } = live;
  // useHighlights has no `data`; `fetchedAt` is set exactly when an answer is on hand.
  const liveState = { ...live, hasData: live.fetchedAt != null && !live.loading };

  // The permanent record — separate request, separate section below. Never affected by
  // dismissing something above: that only hides a live card for a week, this doesn't
  // know dismiss exists.
  const historyQuery = useHighlightHistory();
  const {
    items: history, totalDocs, loadingMore: historyLoadingMore,
    hasMore: historyHasMore, error: historyError, refetch: refetchHistory, loadMore: loadMoreHistory,
  } = historyQuery;
  const state = mergeScreenStates(liveState, { ...historyQuery, hasData: historyQuery.data != null });

  const skeleton = (
    <View style={styles.skeletonCol}>
      {Array.from({ length: 3 }).map((_, i) => (
        <SkeletonState key={i} height={110} borderRadius={radius.lg} />
      ))}
    </View>
  );

  // The live section's own body, rendered beside History rather than in an early return, so
  // History (never affected by any of this) shows regardless of whether there's anything
  // current to say.
  const liveBody = () => {
    // Too new to compare against — an honest wait beats a verdict on two weeks.
    if (warmingUp) return <EmptyState icon="clock" title="Warming up" subtitle={warmingUp} />;
    if (highlights.length === 0) {
      return (
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
      );
    }
    return (
      <>
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
      </>
    );
  };

  return (
    <ScreenScaffold title="Highlights" back states={state}>
      <ScreenStates state={liveState} skeleton={skeleton}>{liveBody}</ScreenStates>

      {/* The permanent record. Unaffected by anything above — a dismissed card, a quiet
          month, a fresh account still warming up all still show every highlight this
          account has ever generated, newest first. Silent when there's truly nothing
          yet (a brand-new account) — the live section above already covers that case. */}
      {/* One error is enough when nothing loaded: the live section's says it. */}
      {(history.length > 0 || (historyError && liveState.hasData)) && (
        <View style={styles.historySection}>
          <SectionHeader label={`All highlights (${groupIndian(totalDocs)})`} />
          {history.map((entry) => (
            <HighlightHistoryRow key={entry.key} entry={entry} />
          ))}
          {historyError ? (
            <ErrorState message={historyError} onRetry={history.length > 0 ? loadMoreHistory : refetchHistory} />
          ) : historyHasMore ? (
            <Button
              label={historyLoadingMore ? "Loading…" : "Load more"}
              variant="ghost"
              loading={historyLoadingMore}
              onPress={loadMoreHistory}
            />
          ) : null}
        </View>
      )}
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  skeletonCol: {
    gap: spacing.lg,
  },
  historySection: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  foot: {
    textAlign: "center",
    lineHeight: 16,
  },
});

export default AssistantScreen;
