import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import type { InsightsCategorySlice } from "@save-n-spend/types";
import { AppText } from "../ui/AppText";
import Icon from "../ui/Icon";
import PressableScale from "../ui/PressableScale";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { formatCalendar } from "@/lib/format/date";
import { spacing } from "@/theme";

type Props = {
  /** The Trips row's children: the trips closed in the period, each its whole share. */
  trips: InsightsCategorySlice[];
};

// What the built-in Trips category opens into, wherever it is listed: each trip closed in the
// period with its close day and total, largest first. A trip opens its page, the only place its
// expenses and their categories show.
const TripsList = ({ trips }: Props) => {
  usePrivacyMask();
  return (
    <View style={styles.list}>
      {[...trips].sort((a, b) => b.total - a.total).map((t) => (
        <PressableScale
          key={t.categoryId}
          style={styles.row}
          scaleTo={0.98}
          onPress={() => router.push({ pathname: "/trip-detail", params: { id: t.categoryId } })}
          accessibilityRole="button"
          accessibilityLabel={`${t.name}${t.closedOn ? `, closed ${formatCalendar(t.closedOn)}` : ""}, ${formatMoney(t.total)}. Opens the trip`}
        >
          <LinearGradient colors={["#5EEAD4", "#14B8A6"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emoji}>
            <AppText size="md">{t.emoji ?? "🧳"}</AppText>
          </LinearGradient>
          <View style={styles.grow}>
            <AppText size="sm" weight="bold" numberOfLines={1}>{t.name}</AppText>
            {t.closedOn && <AppText size="xs" color="inkDim">Closed {formatCalendar(t.closedOn)}</AppText>}
          </View>
          <AppText size="sm" weight="black">{formatMoney(t.total)}</AppText>
          <Icon name="chevronRight" size={16} color="inkDim" />
        </PressableScale>
      ))}
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
