import { StyleSheet, View } from "react-native";
import Card from "./Card";
import { AppText } from "../ui/AppText";
import PressableScale from "../ui/PressableScale";
import { foldCategories, type Slice } from "@/lib/insights";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import type { InsightsCategorySlice } from "@save-n-spend/types";

const Bar = ({ slice }: { slice: Slice }) => (
  <View style={styles.barRow}>
    <AppText size="sm" weight="bold" color="inkSecondary" numberOfLines={1} style={styles.barName}>
      {slice.name}
    </AppText>
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.max(slice.pct, 2)}%`, backgroundColor: slice.color }]} />
    </View>
    <AppText size="xs" weight="bold" color="inkDim">
      {Math.round(slice.pct)}%
    </AppText>
  </View>
);

type BiggestExpense = { title: string; amount: number; daysAgo: number };

type Props = {
  byCategory: InsightsCategorySlice[];
  biggestExpense?: BiggestExpense | null;
  onPress: () => void;
};

// "Where it went" — a glance answer, not a screen to open first: the top-3 categories
// by share this month, plus (once wired) the single expense that moved the number most.
const SpendingSnapshotCard = ({ byCategory, biggestExpense, onPress }: Props) => {
  usePrivacyMask(); // subscribe: the biggest-expense line below reads formatMoney() directly

  // Zero expenses this month — three empty bars would be filler, not information.
  if (byCategory.length === 0) return null;

  const top = foldCategories(byCategory, 3);
  const label = `Where it went: ${top.map((s) => `${s.name} ${Math.round(s.pct)}%`).join(", ")}. Opens Insights.`;

  return (
    <PressableScale onPress={onPress} scaleTo={0.98} accessibilityRole="button" accessibilityLabel={label}>
      <Card style={styles.card}>
        <AppText size="xs" weight="semibold" color="inkDim" style={styles.label}>
          WHERE IT WENT
        </AppText>
        {top.map((slice) => (
          <Bar key={slice.id} slice={slice} />
        ))}
        {biggestExpense && (
          <AppText size="xs" color="inkDim" style={styles.biggest}>
            Biggest expense: <AppText size="xs" weight="bold" color="ink">{formatMoney(biggestExpense.amount)}</AppText>
            {` · ${biggestExpense.title} · ${biggestExpense.daysAgo === 0 ? "today" : `${biggestExpense.daysAgo} day${biggestExpense.daysAgo === 1 ? "" : "s"} ago`}`}
          </AppText>
        )}
      </Card>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: 10,
  },
  label: {
    letterSpacing: 1,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  barName: {
    flex: 0,
    width: 88,
  },
  track: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
  biggest: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    lineHeight: 17,
  },
});

export default SpendingSnapshotCard;
