import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import type { TripListItem } from "@save-n-spend/types";
import Card from "./Card";
import { AppText } from "../ui/AppText";
import Icon from "../ui/Icon";
import PressableScale from "../ui/PressableScale";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { colors, withAlpha, tripsColor } from "@/theme";

// A trip still open, on Home: it counts in no total until it is closed, so this is the only
// place its running share shows outside the trip page.
const OpenTripCard = ({ trip }: { trip: TripListItem }) => {
  usePrivacyMask();
  const line = `${formatMoney(trip.totals.myShare)} so far · counts when you close it`;
  return (
    <PressableScale
      onPress={() => router.push({ pathname: "/trip-detail", params: { id: trip._id } })}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${trip.name}, in progress, ${line}. Opens the trip`}
    >
      <Card style={styles.card}>
        <LinearGradient colors={[colors.tealLight, tripsColor]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emoji}>
          <AppText size="lg">{trip.emoji}</AppText>
        </LinearGradient>
        <View style={styles.grow}>
          <AppText size="sm" weight="bold" numberOfLines={1}>{trip.name} · in progress</AppText>
          <AppText size="xs" color="inkDim">{line}</AppText>
        </View>
        <Icon name="chevronRight" size={16} color="inkDim" />
      </Card>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, borderColor: withAlpha(colors.teal, 0.40), backgroundColor: withAlpha(colors.teal, 0.10) },
  emoji: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  grow: { flex: 1, minWidth: 0 },
});

export default OpenTripCard;
