import { useCallback, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { ITripExpense, TripEntry, TripMemberBalance } from "@save-n-spend/types";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import BackButton from "@/components/shell/BackButton";
import Card from "@/components/data/Card";
import Money from "@/components/ui/Money";
import Icon from "@/components/ui/Icon";
import Button from "@/components/ui/Button";
import PressableScale from "@/components/ui/PressableScale";
import { AppText } from "@/components/ui/AppText";
import ErrorState from "@/components/states/ErrorState";
import SkeletonState from "@/components/states/SkeletonState";
import TripSheet from "@/components/sheets/TripSheet";
import TripExpenseSheet from "@/components/sheets/TripExpenseSheet";
import SettleSheet from "@/components/sheets/SettleSheet";
import { useCategoryById } from "@/lib/categories";
import { useAccountById } from "@/lib/accounts";
import { reopenTrip, tripDates, tripDayNumber, tripDays, useTrip } from "@/lib/trips";
import formatMoney, { roundToRupee, usePrivacyMask } from "@/lib/money";
import { appZone, calendarToday, dayKey, instantInZone } from "@/lib/zone";
import { toast } from "@/store/toast";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { chartPalette, colors, radius, spacing } from "@/theme";

const BAR_COLORS = [colors.primary, colors.warning, colors.info, colors.success, colors.teal];

const CategoryBar = ({ category, total, max, index }: { category: string | null; total: number; max: number; index: number }) => {
  const cat = useCategoryById(category);
  return (
    <View style={styles.catRow}>
      <View style={styles.between}>
        <View style={styles.inline}>
          <Icon name={(cat?.icon ?? "category") as IconName} size={13} color="inkDim" />
          <AppText size="sm" weight="bold">{cat?.name ?? "Uncategorised"}</AppText>
        </View>
        <Money value={total} size="sm" weight="bold" />
      </View>
      <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.max(3, (total / max) * 100)}%`, backgroundColor: BAR_COLORS[index % BAR_COLORS.length] ?? chartPalette[0] }]} /></View>
    </View>
  );
};

const EntryLine = ({ entry, nameOf, onPress }: { entry: TripEntry; nameOf: (id?: string | null) => string; onPress?: () => void }) => {
  const cat = useCategoryById(entry.category);
  const account = useAccountById(entry.account ?? null);
  const meta = entry.kind === "expense"
    ? `${entry.paidBy ? `${nameOf(entry.paidBy)} paid` : "You paid"} ${formatMoney(entry.cost ?? 0)}`
    : entry.kind === "settlement"
      ? `Settle-up · ${entry.direction === "received" ? "into" : "from"} ${account?.name ?? "an account"}`
      : "Let go at close";
  const title = entry.kind === "settlement"
    ? (entry.direction === "received" ? `${nameOf(entry.person)} paid you` : `You paid ${nameOf(entry.person)}`)
    : entry.title;
  const body = (
    <View style={styles.entry}>
      <Icon
        name={entry.kind === "settlement" ? "transfer" : ((cat?.icon ?? "receipt") as IconName)}
        size={14} containerSize={30} containerRadius={10} container="square"
        gradient={entry.kind === "settlement" ? "green" : ((cat?.color ?? "accent") as ColorToken)}
      />
      <View style={styles.grow}>
        <AppText size="sm" weight="bold" numberOfLines={1}>{title}</AppText>
        <AppText size="xs" color="inkDim" numberOfLines={1}>{meta}</AppText>
      </View>
      <View style={styles.right}>
        <Money value={entry.amount} size="sm" weight="bold" color={entry.kind === "settlement" ? "success" : "ink"} />
        <AppText size="xs" color="inkDim">{entry.kind === "settlement" ? "not spending" : "your share"}</AppText>
      </View>
    </View>
  );
  return onPress ? <PressableScale onPress={onPress} scaleTo={0.98}>{body}</PressableScale> : body;
};

const dayTitle = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

// One trip, on one long page: what it's cost you, who owes whom, where your share went, how
// it went day by day, and every expense and settle-up in a day-by-day journal.
const TripDetailScreen = () => {
  usePrivacyMask();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, refetch } = useTrip(id);
  const [refreshing, setRefreshing] = useState(false);

  const editTripRef = useRef<BottomSheetModal>(null);
  const expenseRef = useRef<BottomSheetModal>(null);
  const settleRef = useRef<BottomSheetModal>(null);
  const [editing, setEditing] = useState<ITripExpense | null>(null);
  const [settling, setSettling] = useState<TripMemberBalance | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [showAllDays, setShowAllDays] = useState(false);

  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));

  const zone = appZone();
  const days = useMemo(() => {
    const groups = new Map<string, TripEntry[]>();
    for (const e of data?.entries ?? []) {
      const k = dayKey(new Date(e.occurredAt), zone);
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(e);
    }
    return [...groups].map(([date, entries]) => ({
      date,
      entries,
      spend: entries.filter((e) => e.kind !== "settlement").reduce((s, e) => s + e.amount, 0),
    }));
  }, [data?.entries, zone]);

  if (error) return <ScreenScaffold header={<BackButton />}><ErrorState message={error} onRetry={refetch} /></ScreenScaffold>;
  if (!data) return <ScreenScaffold header={<BackButton />}>{loading && <SkeletonState height={220} borderRadius={radius.lg} />}</ScreenScaffold>;

  const { trip, totals, members, byCategory, byDay } = data;
  const active = trip.status === "active";
  const dayNo = active ? tripDayNumber(trip.startDate, trip.endDate) : null;
  const length = tripDays(trip.startDate, trip.endDate);
  const nameOf = (acc?: string | null) => members.find((m) => m.account === acc)?.name ?? "Someone";
  const maxCat = Math.max(1, ...byCategory.map((c) => c.total));
  // Every day of the trip so far, quiet ones as empty bars, so the chart reads as the trip's
  // calendar rather than only the days that had spending.
  const chartDays = (() => {
    const totals = new Map(byDay.map((d) => [d.date, d.total]));
    const start = new Date(trip.startDate).getTime();
    const last = Math.min(new Date(trip.endDate).getTime(), calendarToday(zone).getTime());
    const out: { date: string; total: number }[] = [];
    for (let t = start; t <= last; t += 86_400_000) {
      const date = new Date(t).toISOString().slice(0, 10);
      out.push({ date, total: totals.get(date) ?? 0 });
    }
    // Spending logged outside the dates still shows, rather than vanishing from the chart.
    for (const d of byDay) if (!out.some((o) => o.date === d.date)) out.push(d);
    return out.sort((a, b) => a.date.localeCompare(b.date));
  })();
  const maxDay = Math.max(1, ...chartDays.map((d) => d.total));
  const biggest = byDay.reduce<{ date: string; total: number } | null>((b, d) => (!b || d.total > b.total ? d : b), null);
  const visibleDays = showAllDays ? days : days.slice(0, 5);
  // Today, or midday on the last day once the trip is over.
  const defaultDate = (() => {
    const end = new Date(trip.endDate);
    return calendarToday(zone) > end
      ? instantInZone(zone, end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate(), 12)
      : new Date();
  })();

  const addExpense = () => { setEditing(null); expenseRef.current?.present(); };
  const editExpense = (expenseId: string) => {
    if (!active) { toast.info("This trip is closed — reopen it to change expenses"); return; }
    setEditing(data.expenses.find((e) => e._id === expenseId) ?? null);
    expenseRef.current?.present();
  };

  const header = (
    <View style={styles.head}>
      <BackButton />
      <AppText size="xl" weight="black" numberOfLines={1} style={styles.grow}>{trip.emoji} {trip.name}</AppText>
      <PressableScale onPress={() => editTripRef.current?.present()} scaleTo={0.9} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit trip">
        <Icon name="edit" size={20} color="inkDim" />
      </PressableScale>
    </View>
  );

  return (
    <ScreenScaffold header={header} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} refreshing={refreshing}>
      {!active && (
        <Card style={styles.closedBanner}>
          <Icon name="check" size={16} color="success" />
          <AppText size="xs" color="inkSecondary" style={styles.grow}>Closed{trip.closedAt ? ` on ${new Date(trip.closedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}. Balances still open can be settled any time.</AppText>
          <PressableScale onPress={async () => { await reopenTrip(trip._id); void refetch(); toast.info(`${trip.name} reopened`); }} scaleTo={0.95}>
            <AppText size="xs" weight="black" color="primary">Reopen</AppText>
          </PressableScale>
        </Card>
      )}

      <Card style={styles.card}>
        <View style={styles.between}>
          <AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>Your share</AppText>
          {active && dayNo && <AppText size="xs" weight="black" color="success">DAY {dayNo} OF {length}</AppText>}
        </View>
        <Money value={totals.myShare} size="xl" weight="black" />
        <AppText size="xs" color="inkDim">
          {tripDates(trip.startDate, trip.endDate)} · {members.length === 0 ? "just you" : `${members.length + 1} people`} · {formatMoney(roundToRupee(totals.myShare / length))} a day
        </AppText>
        {trip.budget && (
          <>
            <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.min(100, (totals.myShare / trip.budget) * 100)}%`, backgroundColor: totals.myShare > trip.budget ? colors.danger : colors.teal }]} /></View>
            <AppText size="xs" color={totals.myShare > trip.budget ? "danger" : "inkDim"}>
              {totals.myShare > trip.budget
                ? `${formatMoney(totals.myShare - trip.budget)} over your ${formatMoney(trip.budget)} budget`
                : `of ${formatMoney(trip.budget)} budget · ${formatMoney(trip.budget - totals.myShare)} left`}
            </AppText>
          </>
        )}
        <View style={styles.three}>
          <View style={styles.grow}><AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>You paid</AppText><Money value={totals.paid} size="sm" weight="black" /></View>
          <View style={styles.grow}><AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>Whole trip</AppText><Money value={totals.wholeTrip} size="sm" weight="black" /></View>
          <View style={styles.grow}>
            <AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>{totals.balance >= 0 ? "Owed to you" : "You owe"}</AppText>
            <Money value={Math.abs(totals.balance)} size="sm" weight="black" color={totals.balance > 0 ? "success" : totals.balance < 0 ? "warning" : "ink"} />
          </View>
        </View>
      </Card>

      {active && (
        <View style={styles.actions}>
          <View style={styles.grow}><Button label="Expense" icon="add" onPress={addExpense} /></View>
          <View style={styles.grow}><Button label="Import" icon="download" variant="secondary" onPress={() => router.push({ pathname: "/trip-import", params: { id: trip._id } })} /></View>
        </View>
      )}

      {members.length > 0 && (
        <>
          <AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>People</AppText>
          <Card style={styles.list}>
            {members.map((m) => (
              <View key={m.account} style={styles.personRow}>
                <Icon name="person" size={14} containerSize={30} containerRadius={15} container="square" gradient="violet" />
                <AppText size="sm" weight="bold" style={styles.grow}>{m.name}</AppText>
                {m.balance === 0 ? (
                  <AppText size="xs" color="inkDim">settled</AppText>
                ) : (
                  <>
                    <AppText size="sm" weight="bold" color={m.balance > 0 ? "success" : "warning"}>
                      {m.balance > 0 ? `owes ${formatMoney(m.balance)}` : `you owe ${formatMoney(-m.balance)}`}
                    </AppText>
                    <PressableScale onPress={() => { setSettling(m); settleRef.current?.present(); }} scaleTo={0.95} style={styles.settleBtn}>
                      <AppText size="xs" weight="bold">Settle</AppText>
                    </PressableScale>
                  </>
                )}
              </View>
            ))}
          </Card>
        </>
      )}

      {byCategory.length > 0 && (
        <>
          <AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>Your share by category</AppText>
          <Card style={styles.card}>
            {byCategory.map((c, i) => <CategoryBar key={c.category ?? "none"} category={c.category} total={c.total} max={maxCat} index={i} />)}
          </Card>
        </>
      )}

      {chartDays.length > 1 && byDay.length > 0 && (
        <>
          <AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>Spend by day</AppText>
          <Card style={styles.card}>
            <View style={styles.chart}>
              {chartDays.map((d) => (
                <View key={d.date} style={[styles.chartBar, d.total === 0 ? styles.chartBarEmpty : { height: `${Math.max(6, (d.total / maxDay) * 100)}%`, backgroundColor: d.date === biggest?.date ? colors.teal : colors.primary }]} />
              ))}
            </View>
            {biggest && <AppText size="xs" color="inkDim" style={styles.center}>Biggest day: {dayTitle(biggest.date)} · {formatMoney(biggest.total)}</AppText>}
          </Card>
        </>
      )}

      <AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>Day by day</AppText>
      {days.length === 0 && (
        <Card><AppText size="sm" color="inkDim">Nothing yet. Add what's been spent — who paid, and who it's split between.</AppText></Card>
      )}
      {visibleDays.map((d, i) => {
        const expanded = openDay === d.date || (openDay === null && i === 0);
        return (
          <Card key={d.date} style={styles.card}>
            <PressableScale onPress={() => setOpenDay(expanded ? "" : d.date)} scaleTo={0.99}>
              <View style={styles.between}>
                <View>
                  <AppText size="sm" weight="bold">{dayTitle(d.date)}</AppText>
                  <AppText size="xs" color="inkDim">{d.entries.length} {d.entries.length === 1 ? "entry" : "entries"}</AppText>
                </View>
                {/* A day of only settle-ups had no spending, which "₹0" reads as a mistake. */}
                <AppText size="sm" weight="bold" color={d.spend === 0 ? "inkDim" : "ink"}>
                  {d.spend === 0 ? (d.entries.length === 1 ? "Settle-up" : "Settle-ups") : formatMoney(d.spend)} {expanded ? "▾" : "▸"}
                </AppText>
              </View>
            </PressableScale>
            {expanded && (
              <View style={styles.dayBody}>
                {d.entries.map((e) => (
                  <EntryLine key={e.id} entry={e} nameOf={nameOf} onPress={e.kind === "expense" ? () => editExpense(e.id) : undefined} />
                ))}
              </View>
            )}
          </Card>
        );
      })}
      {days.length > 5 && (
        <Button label={showAllDays ? "Show fewer days" : `Show all ${days.length} days`} variant="ghost" onPress={() => setShowAllDays((s) => !s)} />
      )}

      {active && (
        <Button label="Wrap up this trip" variant="secondary" onPress={() => router.push({ pathname: "/trip-wrapup", params: { id: trip._id } })} />
      )}

      <TripSheet ref={editTripRef} trip={trip} onSaved={() => { void refetch(); }} onDeleted={() => router.back()} />
      <TripExpenseSheet ref={expenseRef} tripId={trip._id} members={members} expense={editing} defaultDate={defaultDate} onSaved={() => { void refetch(); }} />
      <SettleSheet ref={settleRef} tripId={trip._id} member={settling} onSaved={() => { void refetch(); }} />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  grow: { flex: 1, minWidth: 0 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  inline: { flexDirection: "row", alignItems: "center", gap: 6 },
  right: { alignItems: "flex-end" },
  center: { textAlign: "center" },
  caps: { letterSpacing: 1.2, textTransform: "uppercase" },
  card: { gap: spacing.sm },
  list: { paddingVertical: 2 },
  closedBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  three: { flexDirection: "row", marginTop: spacing.xs },
  bar: { height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
  actions: { flexDirection: "row", gap: spacing.sm },
  personRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  settleBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.13)" },
  catRow: { gap: 4 },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 64 },
  chartBar: { flex: 1, borderRadius: 3 },
  chartBarEmpty: { height: 3, backgroundColor: "rgba(255,255,255,0.10)" },
  dayBody: { gap: 2, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  entry: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 6 },
});

export default TripDetailScreen;
