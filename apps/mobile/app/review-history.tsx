import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import BackButton from "@/components/shell/BackButton";
import Card from "@/components/data/Card";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import { AppText } from "@/components/ui/AppText";
import { listReviewMonths, listReviewWeeks, type ReviewHistoryRow } from "@/lib/reviews";
import { spacing } from "@/theme";

const GroupLabel = ({ children }: { children: string }) => (
  <AppText size="xs" weight="bold" color="inkDim" style={styles.groupLabel}>
    {children}
  </AppText>
);

// Nothing is fetched here — every row is an enumerable calendar date (see
// listReviewMonths/listReviewWeeks), and the review behind it is computed fresh the
// moment it's opened.
const Row = ({ row, first }: { row: ReviewHistoryRow; first?: boolean }) => (
  <PressableScale
    onPress={() => router.push({ pathname: "/review", params: { period: row.period, offset: String(row.offset) } })}
    scaleTo={0.985}
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
    <ScreenScaffold
      header={
        <View style={styles.head}>
          <BackButton />
          <AppText size="xl" weight="black">
            Reviews
          </AppText>
        </View>
      }
    >
      <GroupLabel>MONTHS</GroupLabel>
      <Card padded={false} style={styles.group}>
        {months.map((row, i) => (
          <Row key={`${row.period}-${row.offset}`} row={row} first={i === 0} />
        ))}
      </Card>

      <GroupLabel>WEEKS</GroupLabel>
      <Card padded={false} style={styles.group}>
        {weeks.map((row, i) => (
          <Row key={`${row.period}-${row.offset}`} row={row} first={i === 0} />
        ))}
      </Card>
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  groupLabel: {
    letterSpacing: 1.5,
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
