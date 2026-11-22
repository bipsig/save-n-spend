import { StyleSheet, View } from "react-native";
import Card from "./Card";
import { AppText } from "../ui/AppText";
import Caps from "../ui/Caps";
import PressableScale from "../ui/PressableScale";
import { foldCategories } from "@/lib/insights";
import { categoryShares } from "@/lib/everydaySpend";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { count } from "@/lib/format/count";
import { daysAgoLabel } from "@/lib/format/date";
import { formatPct } from "@/lib/format/pct";
import type { InsightsCategorySlice, UncategorisedSpend } from "@save-n-spend/types";
import { colors } from "@/theme";

type BarSlice = { id: string; name: string; pct: number; color: string };

const Bar = ({ slice }: { slice: BarSlice }) => (
  <View style={styles.barRow}>
    <AppText size="sm" weight="bold" color="inkSecondary" numberOfLines={1} style={styles.barName}>
      {slice.name}
    </AppText>
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.max(slice.pct, 2)}%`, backgroundColor: slice.color }]} />
    </View>
    <AppText size="xs" weight="bold" color="inkDim">
      {formatPct(slice.pct)}
    </AppText>
  </View>
);

type BiggestExpense = { title: string; amount: number; daysAgo: number };

type Props = {
  byCategory: InsightsCategorySlice[];
  /** Absent before the 2.8.4 API: the bars then keep the 2.8.3 shares. */
  uncategorised?: UncategorisedSpend;
  biggestExpense?: BiggestExpense | null;
  onPress: () => void;
};

// "Where it went" — a glance answer, not a screen to open first: the top-3 categories
// by share this month, plus (once wired) the single expense that moved the number most.
const SpendingSnapshotCard = ({ byCategory, uncategorised, biggestExpense, onPress }: Props) => {
  usePrivacyMask(); // subscribe: the biggest-expense line below reads formatMoney() directly

  // Zero expenses this month — three empty bars would be filler, not information.
  if (byCategory.length === 0) return null;

  // The server's shares of all spending (Trips ranked among them), as Insights' "By category".
  const shares = categoryShares(byCategory, uncategorised, 3);
  const top: BarSlice[] = shares
    ? shares.list.map((s) => ({ ...s, pct: s.pct ?? 0 }))
    : foldCategories(byCategory, 3);
  if (top.length === 0) return null;
  const label = `Where it went: ${top.map((s) => `${s.name} ${formatPct(s.pct)}`).join(", ")}. Opens Insights.`;

  return (
    <PressableScale onPress={onPress} scaleTo={0.98} accessibilityRole="button" accessibilityLabel={label}>
      <Card style={styles.card}>
        <Caps>Where it went</Caps>
        {top.map((slice) => (
          <Bar key={slice.id} slice={slice} />
        ))}
        {biggestExpense && (
          <AppText size="xs" color="inkDim" style={styles.biggest}>
            Biggest expense: <AppText size="xs" weight="bold" color="ink">{formatMoney(biggestExpense.amount)}</AppText>
            {` · ${biggestExpense.title} · ${daysAgoLabel(biggestExpense.daysAgo) ?? `${count(biggestExpense.daysAgo, "day")} ago`}`}
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
    borderTopColor: colors.surface2,
    lineHeight: 17,
  },
});

export default SpendingSnapshotCard;
