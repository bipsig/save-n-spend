import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { ReviewPeriod } from "@save-n-spend/types";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import ReviewTimeline from "@/components/data/ReviewTimeline";
import TripsList from "@/components/data/TripsList";
import PressableScale from "@/components/ui/PressableScale";
import Sparkline from "@/components/charts/Sparkline";
import Money from "@/components/ui/Money";
import Caps from "@/components/ui/Caps";
import { StatRow } from "@/components/ui/StatTile";
import { AppText } from "@/components/ui/AppText";
import MaskedText from "@/components/ui/MaskedText";
import Icon from "@/components/ui/Icon";
import NotFoundState from "@/components/states/NotFoundState";
import ScreenStates, { ListSkeleton } from "@/components/states/ScreenStates";
import { useReview } from "@/lib/reviews";
import { isTrips, reviewRows } from "@/lib/everydaySpend";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { count } from "@/lib/format/count";
import { formatPct, percentOf } from "@/lib/format/pct";
import { rangeLabel } from "@/lib/dateRange";
import { chartSummary } from "@/lib/chartSummary";
import { barGradients } from "@/theme/gradients";
import { colors, spacing } from "@/theme";
import { tripsColor } from "@/theme/charts";
import { signTone } from "@/lib/signTone";

/** "+6.8% vs last month" / "Same as last month" / null. Null when there's no real previous
 *  figure to compare against (a brand-new account's first tracked period). */
const pctDelta = (current: number, previous: number, against: string): { text: string; pct: number } | null => {
  if (previous <= 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const shown = formatPct(pct, { kind: "change" });
  if (shown === "0.0%") return { text: `Same as ${against}`, pct: 0 };
  return { text: `${shown} vs ${against}`, pct };
};

const ReviewScreen = () => {
  // D23: without the subscription a peek left these figures masked.
  const masked = usePrivacyMask();
  const { period: periodParam, offset: offsetParam } = useLocalSearchParams<{ period: string; offset: string }>();
  const period: ReviewPeriod = periodParam === "week" ? "week" : "month";
  const offset = Number(offsetParam ?? -1);

  // A review is of a period that has finished: offset -1 or older.
  const closed = Number.isInteger(offset) && offset <= -1;
  const q = useReview(period, offset, closed);
  const review = q.data;
  // Every figure holds each closed trip once, on its close day (trips=entries).
  const rows = review ? reviewRows(review) : null;
  const [tripsOpen, setTripsOpen] = useState(false);
  const state = { ...q, hasData: review != null };
  const against = period === "month" ? "last month" : "last week";

  return (
    <ScreenScaffold title={period === "month" ? "Month in review" : "Week in review"} back states={closed ? state : undefined}>
      {!closed ? (
        <NotFoundState thing="review" subtitle="A review is ready once its period has finished" />
      ) : (
        <ScreenStates state={state} skeleton={<ListSkeleton rows={4} height={80} />}>
          {() => review && rows && (
            <>
              <Card style={styles.card}>
                <View style={styles.heroRow}>
                  <Icon name="summary" size={21} containerSize={46} containerRadius={15} container="square" gradient="violet" />
                  <View style={styles.heroText}>
                    <Caps>{rangeLabel(period, offset)}</Caps>
                    <MaskedText size="lg" weight="black">
                      {review.verdict.headline}
                    </MaskedText>
                  </View>
                </View>
                <MaskedText size="sm" color="inkSecondary" style={styles.heroDetail}>
                  {review.verdict.detail}
                </MaskedText>
              </Card>

              {review.timeline.length > 0 && (
                <>
                  <Caps header style={styles.groupLabel}>How your period unfolded</Caps>
                  <Card style={styles.card}>
                    <ReviewTimeline moments={review.timeline} />
                  </Card>
                </>
              )}

              <StatRow
                items={(
                  [
                    ["Income", review.income, review.previousIncome, "up"],
                    ["Expenses", review.expenses, review.previousExpenses, "down"],
                    ["Saved", review.saved, review.previousSaved, "up"],
                  ] as const
                ).map(([label, amount, previous, goodWhen]) => {
                  const delta = pctDelta(amount, previous, against);
                  return {
                    label,
                    amount,
                    change: delta && { text: delta.text, tone: delta.pct === 0 ? "inkDim" : signTone(delta.pct, { goodWhen }) },
                  };
                })}
              />

              {rows.length > 0 && (
                <>
                  <Caps header style={styles.groupLabel}>Where it went</Caps>
                  <Card style={styles.card}>
                    {rows.map((cat, i) => {
                      const trips = isTrips(cat.id);
                      const row = (
                        <View style={[styles.catRow, i === rows.length - 1 && !(trips && tripsOpen) && styles.noBorder]}>
                          <View style={[styles.catName, styles.catNameRow]}>
                            <AppText size="sm" weight="semibold" color="inkSecondary" numberOfLines={1} style={styles.shrink}>
                              {cat.name}
                            </AppText>
                            {trips && <Icon name={tripsOpen ? "chevronUp" : "chevronDown"} size={14} color="inkDim" />}
                          </View>
                          <View style={styles.catBarTrack}>
                            <View style={[styles.catBarFill, { width: `${cat.pct}%`, backgroundColor: trips ? tripsColor : barGradients.violet[1] }]} />
                          </View>
                          <AppText size="xs" weight="bold" color="inkDim">
                            {formatPct(cat.pct)}
                          </AppText>
                        </View>
                      );
                      if (!trips) return <View key={cat.id}>{row}</View>;
                      const kids = review.categories.find((c) => c.categoryId === cat.id)?.children ?? [];
                      return (
                        <View key={cat.id}>
                          <PressableScale
                            onPress={() => setTripsOpen((v) => !v)}
                            scaleTo={0.98}
                            accessibilityRole="button"
                            accessibilityLabel={`Trips, ${formatPct(cat.pct)}, ${formatMoney(cat.total)}`}
                            accessibilityState={{ expanded: tripsOpen }}
                          >
                            {row}
                          </PressableScale>
                          {tripsOpen && kids.length > 0 && <View style={styles.tripsList}><TripsList trips={kids} /></View>}
                        </View>
                      );
                    })}
                    {review.biggestExpense && (
                      <AppText size="xs" color="inkDim" style={styles.biggestExpense}>
                        Biggest expense: <AppText size="xs" weight="bold" color="ink">{review.biggestExpense.title} · {formatMoney(review.biggestExpense.amount)}</AppText>
                      </AppText>
                    )}
                  </Card>
                </>
              )}

              <Caps header style={styles.groupLabel}>Habits</Caps>
              <StatRow
                items={[
                  { label: "Days logged in a row", text: String(review.habits.streakAtEnd) },
                  { label: "No-spend days", text: String(review.habits.noSpendDays) },
                ]}
              />

              {review.netWorth && (
                <>
                  <Caps header style={styles.groupLabel}>Net worth</Caps>
                  <Card style={styles.card}>
                    <Money value={review.netWorth.total} weight="black" size="lg" />
                    <AppText
                      size="sm"
                      weight="bold"
                      color={signTone(review.netWorth.total - review.netWorth.previousTotal)}
                      style={styles.netWorthDelta}
                    >
                      {formatMoney(review.netWorth.total - review.netWorth.previousTotal, { sign: "always" })} this period
                    </AppText>
                    <Sparkline
                      values={[review.netWorth.previousTotal, review.netWorth.total]}
                      summary={chartSummary({
                        title: "Net worth",
                        masked,
                        parts: [`${formatMoney(review.netWorth.previousTotal)} at the start`, `${formatMoney(review.netWorth.total)} at the end`],
                      })}
                    />
                  </Card>
                </>
              )}

              {review.goals.length > 0 && (
                <>
                  <Caps header style={styles.groupLabel}>Goals</Caps>
                  <Card style={styles.card}>
                    {review.goals.map((goal, i) => (
                      <View key={goal.goalId} style={[styles.goalRow, i === review.goals.length - 1 && styles.noBorder]}>
                        <Icon name="savings" size={16} color="success" />
                        <AppText size="sm" weight="semibold" color="inkSecondary" style={styles.catName}>
                          {goal.name}
                        </AppText>
                        <AppText size="sm" weight="bold" color="success">
                          {formatMoney(goal.contributed, { sign: "always" })}
                        </AppText>
                      </View>
                    ))}
                  </Card>
                </>
              )}

              {review.investments && (review.investments.contributed > 0 || review.investments.portfolioChange !== 0) && (
                <>
                  <Caps header style={styles.groupLabel}>Investments</Caps>
                  <StatRow
                    items={[
                      { label: "Contributed", amount: review.investments.contributed },
                      {
                        label: "Portfolio",
                        amount: review.investments.portfolioChange,
                        signed: true,
                        tone: signTone(review.investments.portfolioChange, { neutral: "ink" }),
                      },
                    ]}
                  />
                  {(review.income > 0 && review.investments.contributed > 0) || review.investments.biggestGainer ? (
                    <Card style={styles.card}>
                      {review.income > 0 && review.investments.contributed > 0 && (
                        <View style={styles.hlRow}>
                          <Icon name="investments" size={14} color="success" />
                          <AppText size="xs" weight="semibold" color="inkDim">
                            You invested {formatPct(percentOf(review.investments.contributed, review.income))} of the income you logged
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
                  ) : null}
                </>
              )}

              {(review.bills.paidCount > 0 || review.bills.dueCount > 0) && (
                <>
                  <Caps header style={styles.groupLabel}>Bills</Caps>
                  <Card style={styles.card}>
                    <AppText size="sm" weight="semibold" color="inkSecondary">
                      {count(review.bills.paidCount, "bill")} paid this period
                      {review.bills.dueCount > 0 ? ` · ${review.bills.dueCount} due` : ""}
                    </AppText>
                    {review.bills.late.map((bill, i) => (
                      <View key={`${bill.name}-${i}`} style={styles.hlRow}>
                        <Icon name="alarm" size={14} color="warning" />
                        <AppText size="xs" weight="semibold" color="inkDim">
                          {bill.name} — paid {count(bill.daysLate, "day")} late
                        </AppText>
                      </View>
                    ))}
                  </Card>
                </>
              )}
            </>
          )}
        </ScreenStates>
      )}
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  groupLabel: {
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
  heroDetail: {
    lineHeight: 20,
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
  catNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  shrink: {
    flexShrink: 1,
  },
  tripsList: {
    paddingVertical: spacing.sm,
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
