import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { TripListItem } from "@save-n-spend/types";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import BackButton from "@/components/shell/BackButton";
import Card from "@/components/data/Card";
import Money from "@/components/ui/Money";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import { AppText } from "@/components/ui/AppText";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import SkeletonState from "@/components/states/SkeletonState";
import TripSheet from "@/components/sheets/TripSheet";
import { TRIP_GRADIENTS, tripDates, tripDayNumber, tripDays, useTrips } from "@/lib/trips";
import formatMoney, { roundToRupee, usePrivacyMask } from "@/lib/money";
import { colors, radius, spacing } from "@/theme";

const Tag = ({ label, tone }: { label: string; tone: "ok" | "warn" | "band" }) => (
  <View style={[styles.tag, tone === "ok" ? styles.tagOk : tone === "warn" ? styles.tagWarn : styles.tagBand]}>
    <AppText size="xs" weight="black" color={tone === "ok" ? "success" : tone === "warn" ? "warning" : "ink"} style={styles.tagText}>{label}</AppText>
  </View>
);

const TripCard = ({ trip, onPress }: { trip: TripListItem; onPress: () => void }) => {
  const active = trip.status === "active";
  const day = active ? tripDayNumber(trip.startDate, trip.endDate) : null;
  const people = trip.members.length + 1;
  const bal = trip.totals.balance;
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} accessibilityRole="button" accessibilityLabel={`${trip.name}, your share ${formatMoney(trip.totals.myShare)}`}>
      <Card style={styles.tripCard} padded={false}>
        <LinearGradient colors={TRIP_GRADIENTS[trip.color] ?? TRIP_GRADIENTS.teal} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.band, active && styles.bandTall]}>
          <AppText size={active ? "lg" : "md"} weight="black" numberOfLines={1} style={styles.grow}>{trip.emoji} {trip.name}</AppText>
          <Tag tone="band" label={active ? (day ? `ACTIVE · DAY ${day}` : "ACTIVE") : "CLOSED"} />
        </LinearGradient>
        <View style={styles.cardBody}>
          <View style={styles.grow}>
            {active && <AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>Your share</AppText>}
            <Money value={trip.totals.myShare} size={active ? "xl" : "md"} weight="black" />
            <AppText size="xs" color="inkDim">{tripDates(trip.startDate, trip.endDate)} · {people} {people === 1 ? "person" : "people"}</AppText>
          </View>
          {active ? (
            <View style={styles.right}>
              <AppText size="xs" color="inkDim">Balance</AppText>
              <AppText size="md" weight="black" color={bal > 0 ? "success" : bal < 0 ? "warning" : "inkDim"}>
                {bal === 0 ? "Settled" : `${bal > 0 ? "+" : "−"}${formatMoney(Math.abs(bal))}`}
              </AppText>
              {bal !== 0 && <AppText size="xs" color="inkDim">{bal > 0 ? "owed to you" : "you owe"}</AppText>}
            </View>
          ) : trip.openBalances > 0 ? (
            <Tag tone="warn" label={`${trip.openBalances} OPEN`} />
          ) : (
            <Tag tone="ok" label="SETTLED" />
          )}
        </View>
      </Card>
    </PressableScale>
  );
};

// More → Trips. Every trip across every year: an all-trips summary with a bar per year (tap
// one to show just that year), the active trip on top, then the rest grouped by year.
const TripsScreen = () => {
  usePrivacyMask();
  const router = useRouter();
  const { data, loading, error, refetch } = useTrips();
  const newRef = useRef<BottomSheetModal>(null);
  const [year, setYear] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));

  const trips = data?.trips ?? [];
  const yearOf = (t: { startDate: string }) => new Date(t.startDate).getUTCFullYear();
  const active = trips.filter((t) => t.status === "active" && (year === null || yearOf(t) === year));
  const closed = trips.filter((t) => t.status === "closed" && (year === null || yearOf(t) === year));
  const years = [...new Set(closed.map(yearOf))].sort((a, b) => b - a);
  const maxYear = Math.max(1, ...(data?.byYear ?? []).map((y) => y.myShare));
  const open = (id: string) => router.push({ pathname: "/trip-detail", params: { id } });

  const header = (
    <View style={styles.head}>
      <BackButton />
      <AppText size="xl" weight="black" style={styles.grow}>Trips</AppText>
      <PressableScale onPress={() => newRef.current?.present()} scaleTo={0.94} hitSlop={8} accessibilityRole="button" accessibilityLabel="New trip">
        <View style={styles.newBtn}><Icon name="add" size={15} color="ink" /><AppText size="xs" weight="bold">New</AppText></View>
      </PressableScale>
    </View>
  );

  return (
    <ScreenScaffold header={header} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} refreshing={refreshing}>
      {error && <ErrorState message={error} onRetry={refetch} />}
      {!error && loading && !data && <SkeletonState height={200} borderRadius={radius.lg} />}

      {!error && data && trips.length === 0 && (
        <EmptyState
          icon="flight"
          title="No trips yet"
          subtitle="Start one before you go — log what's spent, who paid, and who owes whom, and it stays out of your everyday categories."
          actionLabel="Start a trip"
          onAction={() => newRef.current?.present()}
        />
      )}

      {!error && data && trips.length > 0 && (
        <>
          <Card style={styles.card}>
            <AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>All trips</AppText>
            <View style={styles.summaryTop}>
              <View style={styles.grow}>
                <Money value={data.allTime.myShare} size="xl" weight="black" />
                <AppText size="xs" color="inkDim">
                  your share across {data.allTime.trips} {data.allTime.trips === 1 ? "trip" : "trips"}
                  {data.allTime.trips > 1 ? ` · avg ${formatMoney(roundToRupee(data.allTime.myShare / data.allTime.trips))}` : ""}
                </AppText>
              </View>
              {data.allTime.open > 0 && (
                <View style={styles.right}>
                  <AppText size="xs" weight="bold" color="warning">{formatMoney(roundToRupee(data.allTime.open))} open</AppText>
                  <AppText size="xs" color="inkDim">across {data.allTime.openTrips} {data.allTime.openTrips === 1 ? "trip" : "trips"}</AppText>
                </View>
              )}
            </View>
            {data.byYear.length > 1 && (
              <View style={styles.years}>
                {data.byYear.map((y) => {
                  const on = year === y.year;
                  return (
                    <PressableScale key={y.year} onPress={() => setYear(on ? null : y.year)} scaleTo={0.98} accessibilityRole="button" accessibilityState={{ selected: on }}>
                      <View style={styles.yearRow}>
                        <AppText size="xs" weight="bold" color={on ? "primary" : "ink"}>{y.year}</AppText>
                        <AppText size="xs" color="inkDim">{y.trips} {y.trips === 1 ? "trip" : "trips"} · <AppText size="xs" weight="bold">{formatMoney(y.myShare)}</AppText></AppText>
                      </View>
                      <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.max(4, (y.myShare / maxYear) * 100)}%`, backgroundColor: on ? colors.primary : colors.teal }]} /></View>
                    </PressableScale>
                  );
                })}
                {year !== null && <AppText size="xs" color="primary" weight="bold">Showing {year} · tap it again for all years</AppText>}
              </View>
            )}
          </Card>

          {active.length > 0 && (
            <>
              <AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>Active</AppText>
              {active.map((t) => <TripCard key={t._id} trip={t} onPress={() => open(t._id)} />)}
            </>
          )}

          {years.map((y) => {
            const inYear = closed.filter((t) => yearOf(t) === y);
            // The same figures as the year's bar above, which count an active trip too — said
            // so, since that trip's card is up top rather than in this group.
            const summary = data.byYear.find((b) => b.year === y);
            const count = summary?.trips ?? inYear.length;
            const total = summary?.myShare ?? inYear.reduce((s, t) => s + t.totals.myShare, 0);
            const withActive = trips.some((t) => t.status === "active" && yearOf(t) === y);
            return (
              <View key={y} style={styles.group}>
                <View style={styles.yearHead}>
                  <AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>{y}</AppText>
                  <AppText size="xs" color="inkDim">{count} {count === 1 ? "trip" : "trips"} · {formatMoney(total)}{withActive ? " · incl. active" : ""}</AppText>
                </View>
                {inYear.map((t) => <TripCard key={t._id} trip={t} onPress={() => open(t._id)} />)}
              </View>
            );
          })}
        </>
      )}

      <TripSheet ref={newRef} trip={null} onSaved={(id) => { void refetch(); open(id); }} />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  grow: { flex: 1, minWidth: 0 },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.13)" },
  caps: { letterSpacing: 1.2, textTransform: "uppercase" },
  card: { gap: spacing.sm },
  summaryTop: { flexDirection: "row", alignItems: "flex-end", gap: spacing.md },
  right: { alignItems: "flex-end" },
  years: { gap: 8, marginTop: spacing.xs },
  yearRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  bar: { height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
  tripCard: { overflow: "hidden" },
  band: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: 14, paddingVertical: 10 },
  bandTall: { paddingVertical: 16 },
  cardBody: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: 14 },
  tag: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  tagText: { fontSize: 9.5, letterSpacing: 0.4 },
  tagOk: { backgroundColor: "rgba(52,224,161,0.15)" },
  tagWarn: { backgroundColor: "rgba(255,177,92,0.15)" },
  tagBand: { backgroundColor: "rgba(0,0,0,0.25)" },
  group: { gap: spacing.sm },
  yearHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});

export default TripsScreen;
