import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import type { InsightsCategorySlice } from "@save-n-spend/types";
import { AppText } from "../ui/AppText";
import Icon from "../ui/Icon";
import PressableScale from "../ui/PressableScale";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { formatCalendar } from "@/lib/format/date";
import { formatSpan } from "@/lib/format/period";
import { useTripName } from "@/store/tripNames";
import { spacing, colors, tripsColor } from "@/theme";

type Props = {
  /** The Trips row's children: the trips closed in the period, each its whole share. */
  trips: InsightsCategorySlice[];
};

const TripRow = ({ trip }: { trip: InsightsCategorySlice }) => {
  // The slice carries no trip days; the trip list the app already keeps does.
  const known = useTripName(trip.categoryId);
  const span = known ? `${formatSpan(new Date(known.startDate), new Date(known.endDate))} trip` : null;
  const line = [trip.closedOn ? `Closed ${formatCalendar(trip.closedOn)}` : null, span].filter(Boolean).join(" · ");
  return (
    <PressableScale
      style={styles.row}
      scaleTo={0.98}
      onPress={() => router.push({ pathname: "/trip-detail", params: { id: trip.categoryId } })}
      accessibilityRole="button"
      accessibilityLabel={`${trip.name}${line ? `, ${line}` : ""}, ${formatMoney(trip.total)}. Opens the trip`}
    >
      <LinearGradient colors={[colors.tealLight, tripsColor]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emoji}>
        <AppText size="md">{trip.emoji ?? "🧳"}</AppText>
      </LinearGradient>
      <View style={styles.grow}>
        <AppText size="sm" weight="bold" numberOfLines={1}>{trip.name}</AppText>
        {line ? <AppText size="xs" color="inkDim" numberOfLines={2}>{line}</AppText> : null}
      </View>
      <AppText size="sm" weight="black">{formatMoney(trip.total)}</AppText>
      <Icon name="chevronRight" size={16} color="inkDim" />
    </PressableScale>
  );
};

// What the built-in Trips category opens into, wherever it is listed: each trip closed in the
// period with its close day, its days and total, largest first. A trip opens its page, the only
// place its expenses and their categories show.
const TripsList = ({ trips }: Props) => {
  usePrivacyMask();
  return (
    <View style={styles.list}>
      {[...trips].sort((a, b) => b.total - a.total).map((t) => <TripRow key={t.categoryId} trip={t} />)}
    </View>
  );
};

const styles = StyleSheet.create({
  list: { gap: spacing.sm, paddingLeft: 17 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  emoji: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  grow: { flex: 1, minWidth: 0 },
});

export default TripsList;
