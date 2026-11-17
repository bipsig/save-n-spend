import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { TripListItem } from "@save-n-spend/types";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import Money from "@/components/ui/Money";
import Badge from "@/components/ui/Badge";
import Caps from "@/components/ui/Caps";
import PressableScale from "@/components/ui/PressableScale";
import { AppText } from "@/components/ui/AppText";
import EmptyState from "@/components/states/EmptyState";
import ScreenStates from "@/components/states/ScreenStates";
import SkeletonState from "@/components/states/SkeletonState";
import TripSheet from "@/components/sheets/TripSheet";
import { TRIP_GRADIENTS, tripDayNumber, useTrips } from "@/lib/trips";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { count } from "@/lib/format/count";
import { formatSpan } from "@/lib/format/period";
import { screenTitles } from "@/data/menu";
import { colors, radius, spacing } from "@/theme";

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
          <Badge size="sm" tone="onGradient" label={active ? (day ? `Active · day ${day}` : "Active") : "Closed"} />
        </LinearGradient>
        <View style={styles.cardBody}>
          <View style={styles.grow}>
            {active && <Caps>Your share</Caps>}
            <Money value={trip.totals.myShare} size={active ? "xl" : "md"} weight="black" />
            <AppText size="xs" color="inkDim">{formatSpan(new Date(trip.startDate), new Date(trip.endDate))} · {count(people, "person", "people")}</AppText>
          </View>
          {active ? (
            <View style={styles.right}>
              <AppText size="xs" color="inkDim">Balance</AppText>
              <AppText size="md" weight="black" color={bal > 0 ? "success" : bal < 0 ? "warning" : "inkDim"}>
                {bal === 0 ? "Settled" : formatMoney(bal, { sign: "always" })}
              </AppText>
              {bal !== 0 && <AppText size="xs" color="inkDim">{bal > 0 ? "owed to you" : "you owe"}</AppText>}
            </View>
          ) : trip.openBalances > 0 ? (
            <Badge size="sm" tone="warning" label={`${trip.openBalances} open`} />
          ) : (
            <Badge size="sm" tone="success" label="Settled" />
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
  const q = useTrips();
  const { data } = q;
  const state = { ...q, hasData: data != null };
  const newRef = useRef<BottomSheetModal>(null);
  const [year, setYear] = useState<number | null>(null);

  const trips = data?.trips ?? [];
  const yearOf = (t: { startDate: string }) => new Date(t.startDate).getUTCFullYear();
  const active = trips.filter((t) => t.status === "active" && (year === null || yearOf(t) === year));
  const closed = trips.filter((t) => t.status === "closed" && (year === null || yearOf(t) === year));
  const years = [...new Set(closed.map(yearOf))].sort((a, b) => b - a);
  const maxYear = Math.max(1, ...(data?.byYear ?? []).map((y) => y.myShare));
  const open = (id: string) => router.push({ pathname: "/trip-detail", params: { id } });

  return (
    <ScreenScaffold
      title={screenTitles.trips}
      back
      actions={[{ kind: "new", label: "New trip", onPress: () => newRef.current?.present() }]}
      states={state}>
      <ScreenStates state={state} skeleton={<SkeletonState height={200} borderRadius={radius.lg} />}>
        {() => data && (trips.length === 0 ? (
          <EmptyState
            icon="flight"
            title="No trips yet"
            subtitle="Start one before you go — log what's spent, who paid, and who owes whom, and it stays out of your everyday categories."
            actionLabel="Start a trip"
            onAction={() => newRef.current?.present()}
          />
        ) : (
          <>
            <Card style={styles.card}>
              <Caps>All trips</Caps>
              <View style={styles.summaryTop}>
                <View style={styles.grow}>
                  <Money value={data.allTime.myShare} size="xl" weight="black" />
                  <AppText size="xs" color="inkDim">
                    your share across {count(data.allTime.trips, "trip")}
                    {data.allTime.trips > 1 ? ` · avg ${formatMoney(data.allTime.myShare / data.allTime.trips)}` : ""}
                  </AppText>
                </View>
                {data.allTime.open > 0 && (
                  <View style={styles.right}>
                    <AppText size="xs" weight="bold" color="warning">{formatMoney(data.allTime.open)} open</AppText>
                    <AppText size="xs" color="inkDim">across {count(data.allTime.openTrips, "trip")}</AppText>
                  </View>
                )}
              </View>
              {data.byYear.length > 1 && (
                <View style={styles.years}>
                  {data.byYear.map((y) => {
                    const on = year === y.year;
                    return (
                      <PressableScale key={y.year} onPress={() => setYear(on ? null : y.year)} scaleTo={0.98} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${y.year}, ${count(y.trips, "trip")}, ${formatMoney(y.myShare)}`} accessibilityHint={on ? "Shows every year" : "Shows only this year"}>
                        <View style={styles.yearRow}>
                          <AppText size="xs" weight="bold" color={on ? "primary" : "ink"}>{y.year}</AppText>
                          <AppText size="xs" color="inkDim">{count(y.trips, "trip")} · <AppText size="xs" weight="bold">{formatMoney(y.myShare)}</AppText></AppText>
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
                <Caps>Active</Caps>
                {active.map((t) => <TripCard key={t._id} trip={t} onPress={() => open(t._id)} />)}
              </>
            )}

            {years.map((y) => {
              const inYear = closed.filter((t) => yearOf(t) === y);
              // The same figures as the year's bar above, which count an active trip too — said
              // so, since that trip's card is up top rather than in this group.
              const summary = data.byYear.find((b) => b.year === y);
              const tripCount = summary?.trips ?? inYear.length;
              const total = summary?.myShare ?? inYear.reduce((s, t) => s + t.totals.myShare, 0);
              const withActive = trips.some((t) => t.status === "active" && yearOf(t) === y);
              return (
                <View key={y} style={styles.group}>
                  <View style={styles.yearHead}>
                    <Caps>{y}</Caps>
                    <AppText size="xs" color="inkDim">{count(tripCount, "trip")} · {formatMoney(total)}{withActive ? " · incl. active" : ""}</AppText>
                  </View>
                  {inYear.map((t) => <TripCard key={t._id} trip={t} onPress={() => open(t._id)} />)}
                </View>
              );
            })}
          </>
        ))}
      </ScreenStates>

      <TripSheet ref={newRef} trip={null} onSaved={(id) => { if (id) open(id); }} />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
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
  group: { gap: spacing.sm },
  yearHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});

export default TripsScreen;
