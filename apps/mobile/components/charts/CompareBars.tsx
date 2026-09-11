import { StyleSheet, View, type DimensionValue } from "react-native";
import { AppText } from "@/components/ui/AppText";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import type { CompareRow } from "@/lib/insights";
import { colors } from "@/theme";

type Props = {
  rows: CompareRow[];
  /** What the faint bar stands for — "last month", "prev wk", "2025". */
  previousLabel: string;
};

const Change = ({ row }: { row: CompareRow }) => {
  if (row.previous === 0) {
    return (
      <AppText size="xs" weight="semibold" color="warning">
        new
      </AppText>
    );
  }
  if (row.current === 0) {
    return (
      <AppText size="xs" weight="semibold" color="success">
        stopped
      </AppText>
    );
  }

  const pct = Math.round(row.deltaPct ?? 0);
  // Spending less is the good direction, so down is green. A rounded 0 keeps its real sign
  // off the bar rather than claiming no change.
  return (
    <AppText size="xs" weight="semibold" color={row.delta <= 0 ? "success" : "danger"}>
      {`${row.delta > 0 ? "+" : "−"}${Math.abs(pct)}%`}
    </AppText>
  );
};

/**
 * Each category twice — this window and the one before — on one shared scale.
 *
 * Paired bars rather than a single signed delta bar: the delta alone cannot tell £50 → £100
 * from £5,000 → £10,000, and both are "+100%". Seeing the two lengths says which one matters.
 *
 * The scale is the largest figure across BOTH windows and all rows, so bar lengths are
 * comparable down the whole card and not just within a row.
 */
const CompareBars = ({ rows, previousLabel }: Props) => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts below
  const max = Math.max(...rows.flatMap((r) => [r.current, r.previous]), 1);
  // A non-zero figure keeps a sliver of bar: a category that cost something must not look
  // like one that cost nothing.
  const width = (v: number): DimensionValue => `${Math.max((v / max) * 100, v > 0 ? 1.5 : 0)}%`;

  return (
    <View style={styles.list}>
      {rows.map((row) => (
        <View key={row.id} style={styles.row}>
          <View style={styles.head}>
            <AppText size="sm" weight="bold" numberOfLines={1} style={styles.name}>
              {row.name}
            </AppText>
            <View style={styles.meta}>
              <AppText size="sm" weight="bold">
                {formatMoney(row.current)}
              </AppText>
              <Change row={row} />
            </View>
          </View>

          <View style={styles.track}>
            <View style={[styles.fill, { width: width(row.current), backgroundColor: row.color }]} />
          </View>
          <View style={styles.track}>
            {/* The same colour at low opacity, not grey: the pair has to read as one category
                measured twice, and a second hue would read as a second thing. */}
            <View
              style={[styles.fill, styles.fillPrev, { width: width(row.previous), backgroundColor: row.color }]}
            />
          </View>

          <AppText size="xs" color="inkDim">
            {`${formatMoney(row.previous)} ${previousLabel}`}
          </AppText>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  list: {
    gap: 18,
    marginTop: 2,
  },
  row: {
    gap: 5,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 2,
  },
  name: {
    flex: 1,
  },
  meta: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  track: {
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.line,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 5,
  },
  fillPrev: {
    opacity: 0.4,
  },
});

export default CompareBars;
