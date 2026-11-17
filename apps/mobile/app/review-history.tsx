import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import Caps from "@/components/ui/Caps";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import { AppText } from "@/components/ui/AppText";
import { listReviewMonths, listReviewWeeks, type ReviewHistoryRow } from "@/lib/reviews";
import { screenTitles } from "@/data/menu";
import { spacing } from "@/theme";

// Nothing is fetched here — every row is an enumerable calendar date (see
// listReviewMonths/listReviewWeeks), and the review behind it is computed fresh the
// moment it's opened.
const Row = ({ row, first }: { row: ReviewHistoryRow; first?: boolean }) => (
  <PressableScale
    onPress={() => router.push({ pathname: "/review", params: { period: row.period, offset: String(row.offset) } })}
    scaleTo={0.985}
    accessibilityLabel={row.label}
    accessibilityHint={`Opens the ${row.period === "month" ? "month" : "week"} in review`}
  >
    <View style={[styles.row, !first && styles.rowDivider]}>
      <AppText weight="bold" size="sm" style={styles.rowLabel}>
        {row.label}
      </AppText>
      <Icon name="chevronRight" size={18} color="inkDim" />
    </View>
  </PressableScale>
);

const ReviewHistoryScreen = () => {
  const months = listReviewMonths();
  const weeks = listReviewWeeks();

  return (
    <ScreenScaffold title={screenTitles.reviews} back>
      <Caps header style={styles.groupLabel}>Months</Caps>
      <Card padded={false} style={styles.group}>
        {months.map((row, i) => (
          <Row key={`${row.period}-${row.offset}`} row={row} first={i === 0} />
        ))}
      </Card>

      <Caps header style={styles.groupLabel}>Weeks</Caps>
      <Card padded={false} style={styles.group}>
        {weeks.map((row, i) => (
          <Row key={`${row.period}-${row.offset}`} row={row} first={i === 0} />
        ))}
      </Card>
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  groupLabel: {
    paddingHorizontal: 2,
    marginTop: spacing.xs,
  },
  group: {
    paddingVertical: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  rowLabel: {
    flex: 1,
  },
});

export default ReviewHistoryScreen;
