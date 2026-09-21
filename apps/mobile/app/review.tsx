import { StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { ReviewPeriod } from "@save-n-spend/types";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import BackButton from "@/components/shell/BackButton";
import Card from "@/components/data/Card";
import ReviewTimeline from "@/components/data/ReviewTimeline";
import Sparkline from "@/components/charts/Sparkline";
import Money from "@/components/ui/Money";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import SkeletonState from "@/components/states/SkeletonState";
import { useReview } from "@/lib/reviews";
import formatMoney from "@/lib/money";
import { barGradients } from "@/theme/gradients";
import { colors, radius, spacing } from "@/theme";

const GroupLabel = ({ children }: { children: string }) => (
  <AppText size="xs" weight="bold" color="inkDim" style={styles.groupLabel}>
    {children}
  </AppText>
);

/** "up 8%" / "down 3%" / null — null when there's no real previous figure to compare
 *  against (a brand-new account's first tracked period). */
const pctDelta = (current: number, previous: number): { text: string; good: boolean } | null => {
  if (previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { text: "same as last time", good: true };
  return { text: `${pct > 0 ? "up" : "down"} ${Math.abs(pct)}%`, good: pct >= 0 };
};

const Stat = ({ label, amount, delta, deltaGoodIsUp = true }: { label: string; amount: number; delta: { text: string; good: boolean } | null; deltaGoodIsUp?: boolean }) => {
  const good = delta ? (deltaGoodIsUp ? delta.good : !delta.good) : true;
  return (
    <View style={styles.stat}>
      <Money value={amount} weight="black" size="md" numberOfLines={1} />
      <AppText size="xs" weight="bold" color="inkDim" style={styles.statLabel}>
        {label}
      </AppText>
      {delta && (
        <AppText size="xs" weight="bold" color={good ? "success" : "danger"}>
          {delta.text}
        </AppText>
      )}
    </View>
  );
};

const ReviewScreen = () => {
  const { period: periodParam, offset: offsetParam } = useLocalSearchParams<{ period: string; offset: string }>();
  const period: ReviewPeriod = periodParam === "week" ? "week" : "month";
  const offset = Number(offsetParam ?? -1);

  const { data: review, loading, error, refetch } = useReview(period, offset);

  return (
    <ScreenScaffold
      header={
        <View style={styles.head}>
          <BackButton />
          <AppText size="xl" weight="black">
            {period === "month" ? "Month in Review" : "Week in Review"}
          </AppText>
        </View>
      }
    >
      {error && <ErrorState message={error} onRetry={refetch} />}

      {!error && loading && !review && (
        <View style={{ gap: spacing.md }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonState key={i} height={80} borderRadius={radius.lg} />
          ))}
        </View>
      )}

      {!error && !loading && !review && (
        <EmptyState icon="summary" title="Nothing to review yet" subtitle="This period doesn't have any activity to recap." />
      )}

      {review && (
        <>
          <Card style={styles.card}>
            <View style={styles.heroRow}>
              <Icon name="summary" size={21} containerSize={46} containerRadius={15} container="square" gradient="violet" />
              <View style={styles.heroText}>
                <AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>
                  {review.periodLabel}
                </AppText>
                <AppText size="lg" weight="black">
                  {review.verdict.headline}
                </AppText>
              </View>
            </View>
            <AppText size="sm" color="inkSecondary" style={styles.heroDetail}>
              {review.verdict.detail}
            </AppText>
          </Card>

          {review.timeline.length > 0 && (
            <>
              <GroupLabel>How your period unfolded</GroupLabel>
              <Card style={styles.card}>
                <ReviewTimeline moments={review.timeline} />
              </Card>
            </>
          )}

          <Card style={styles.card}>
            <View style={styles.statRow}>
              <Stat label="Income" amount={review.income} delta={pctDelta(review.income, review.previousIncome)} />
              <View style={styles.statDivider} />
              <Stat label="Expenses" amount={review.expenses} delta={pctDelta(review.expenses, review.previousExpenses)} deltaGoodIsUp={false} />
              <View style={styles.statDivider} />
              <Stat label="Saved" amount={review.saved} delta={pctDelta(review.saved, review.previousSaved)} />
            </View>
          </Card>

          {review.categories.length > 0 && (
            <>
              <GroupLabel>Where it went</GroupLabel>
              <Card style={styles.card}>
                {review.categories.map((cat, i) => (
                  <View key={cat.categoryId} style={[styles.catRow, i === review.categories.length - 1 && styles.noBorder]}>
                    <AppText size="sm" weight="semibold" color="inkSecondary" numberOfLines={1} style={styles.catName}>
                      {cat.name}
                    </AppText>
                    <View style={styles.catBarTrack}>
                      <View style={[styles.catBarFill, { width: `${cat.pct}%`, backgroundColor: barGradients.violet[1] }]} />
                    </View>
                    <AppText size="xs" weight="bold" color="inkDim">
                      {cat.pct}%
                    </AppText>
                  </View>
                ))}
                {review.biggestExpense && (
                  <AppText size="xs" color="inkDim" style={styles.biggestExpense}>
                    Biggest expense: <AppText size="xs" weight="bold" color="ink">{review.biggestExpense.title} · {formatMoney(review.biggestExpense.amount)}</AppText>
                  </AppText>
                )}
              </Card>
            </>
          )}

          <GroupLabel>Habits</GroupLabel>
          <Card style={styles.card}>
            <View style={styles.statRow}>
              <View style={styles.stat}>
                <AppText size="md" weight="black">{review.habits.streakAtEnd}</AppText>
                <AppText size="xs" weight="bold" color="inkDim" style={styles.statLabel}>days logged in a row</AppText>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <AppText size="md" weight="black">{review.habits.noSpendDays}</AppText>
                <AppText size="xs" weight="bold" color="inkDim" style={styles.statLabel}>no-spend days</AppText>
              </View>
            </View>
          </Card>

          {review.netWorth && (
            <>
              <GroupLabel>Net worth</GroupLabel>
              <Card style={styles.card}>
                <Money value={review.netWorth.total} weight="black" size="lg" />
                <AppText
                  size="sm"
                  weight="bold"
                  color={review.netWorth.total >= review.netWorth.previousTotal ? "success" : "danger"}
                  style={styles.netWorthDelta}
                >
                  {review.netWorth.total >= review.netWorth.previousTotal ? "up " : "down "}
                  {formatMoney(Math.abs(review.netWorth.total - review.netWorth.previousTotal))} this period
                </AppText>
                <Sparkline values={[review.netWorth.previousTotal, review.netWorth.total]} />
              </Card>
            </>
          )}

          {review.goals.length > 0 && (
            <>
              <GroupLabel>Goals</GroupLabel>
              <Card style={styles.card}>
                {review.goals.map((goal, i) => (
                  <View key={goal.goalId} style={[styles.goalRow, i === review.goals.length - 1 && styles.noBorder]}>
                    <Icon name="savings" size={16} color="success" />
                    <AppText size="sm" weight="semibold" color="inkSecondary" style={styles.catName}>
                      {goal.name}
                    </AppText>
                    <AppText size="sm" weight="bold" color="success">
                      +{formatMoney(goal.contributed)}
                    </AppText>
                  </View>
                ))}
              </Card>
            </>
          )}

          {review.investments && (review.investments.contributed > 0 || review.investments.portfolioChange !== 0) && (
            <>
              <GroupLabel>Investments</GroupLabel>
              <Card style={styles.card}>
                <View style={styles.statRow}>
                  <View style={styles.stat}>
                    <Money value={review.investments.contributed} weight="black" size="md" numberOfLines={1} />
                    <AppText size="xs" weight="bold" color="inkDim" style={styles.statLabel}>Contributed</AppText>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.stat}>
                    <AppText size="md" weight="black" color={review.investments.portfolioChange >= 0 ? "success" : "danger"}>
                      {review.investments.portfolioChange >= 0 ? "▲ " : "▼ "}{formatMoney(Math.abs(review.investments.portfolioChange))}
                    </AppText>
                    <AppText size="xs" weight="bold" color="inkDim" style={styles.statLabel}>Portfolio</AppText>
                  </View>
                </View>
                {review.income > 0 && review.investments.contributed > 0 && (
                  <View style={styles.hlRow}>
                    <Icon name="investments" size={14} color="success" />
                    <AppText size="xs" weight="semibold" color="inkDim">
                      You invested {Math.round((review.investments.contributed / review.income) * 100)}% of the income you logged
                    </AppText>
                  </View>
                )}
                {review.investments.biggestGainer && (
                  <View style={styles.hlRow}>
                    <Icon name="investments" size={14} color="success" />
                    <AppText size="xs" weight="semibold" color="inkDim">
                      {review.investments.biggestGainer.name} gained {formatMoney(review.investments.biggestGainer.amount)}
                    </AppText>
                  </View>
                )}
              </Card>
            </>
          )}

          {(review.bills.paidCount > 0 || review.bills.dueCount > 0) && (
            <>
              <GroupLabel>Bills</GroupLabel>
              <Card style={styles.card}>
                <AppText size="sm" weight="semibold" color="inkSecondary">
                  {review.bills.paidCount} bill{review.bills.paidCount === 1 ? "" : "s"} paid this period
                  {review.bills.dueCount > 0 ? ` · ${review.bills.dueCount} due` : ""}
                </AppText>
                {review.bills.late.map((bill, i) => (
                  <View key={`${bill.name}-${i}`} style={styles.hlRow}>
                    <Icon name="alarm" size={14} color="warning" />
                    <AppText size="xs" weight="semibold" color="inkDim">
                      {bill.name} — paid {bill.daysLate} day{bill.daysLate === 1 ? "" : "s"} late
                    </AppText>
                  </View>
                ))}
              </Card>
            </>
          )}
        </>
      )}
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  card: {
    gap: spacing.sm,
  },
  groupLabel: {
    letterSpacing: 1.5,
    paddingHorizontal: 2,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  heroText: {
    flex: 1,
    gap: 2,
  },
  caps: {
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  heroDetail: {
    lineHeight: 20,
  },
  statRow: {
    flexDirection: "row",
  },
  stat: {
    flex: 1,
    gap: 3,
  },
  statLabel: {
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.line,
    marginHorizontal: spacing.sm,
  },
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  noBorder: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  catName: {
    flex: 1,
  },
  catBarTrack: {
    flex: 1.4,
    height: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  catBarFill: {
    height: "100%",
    borderRadius: 999,
  },
  biggestExpense: {
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  netWorthDelta: {
    marginTop: 2,
  },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  hlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
});

export default ReviewScreen;
