import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AppText } from "./AppText";
import PressableScale from "./PressableScale";
import { END_COPY, listEndState } from "@/lib/listEnd";
import { colors, spacing } from "@/theme";

type Props = {
  hasMore: boolean;
  loadingMore: boolean;
  pagesLoaded: number;
  /** A page after the first failed; the line offers to try it again. */
  failed?: boolean;
  onRetry?: () => void;
};

// The foot of every paged list (gaps row 151): see lib/listEnd for when each line shows.
const ListEnd = ({ hasMore, loadingMore, pagesLoaded, failed, onRetry }: Props) => {
  const state = listEndState({ hasMore, loadingMore, pagesLoaded, failed });
  if (state === "loading") return <ActivityIndicator color={colors.primary} style={styles.spinner} />;
  if (state === "failed") {
    return (
      <PressableScale onPress={onRetry} scaleTo={0.97} accessibilityRole="button" accessibilityLabel={`${END_COPY.failed}. ${END_COPY.retry}`} style={styles.line}>
        <AppText size="xs" weight="bold" color="inkSecondary">
          {END_COPY.failed} · <AppText size="xs" weight="bold" color="primary">{END_COPY.retry}</AppText>
        </AppText>
      </PressableScale>
    );
  }
  if (state === "end") {
    return (
      <View style={styles.line} accessibilityRole="text">
        <View style={styles.rule} />
        <AppText size="xs" weight="bold" color="inkDim">{END_COPY.end}</AppText>
        <View style={styles.rule} />
      </View>
    );
  }
  return null;
};

const styles = StyleSheet.create({
  spinner: {
    paddingVertical: spacing.lg,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  rule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
  },
});

export default ListEnd;
