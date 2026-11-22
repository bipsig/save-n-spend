import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { goBackOrHome } from "@/lib/navigation";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { ITripExpense, TripEntry, TripMemberBalance } from "@save-n-spend/types";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import Money from "@/components/ui/Money";
import Caps from "@/components/ui/Caps";
import { StatRow } from "@/components/ui/StatTile";
import Icon from "@/components/ui/Icon";
import { ArchivedChip, NameWithArchived } from "@/components/ui/ArchivedMark";
import Button from "@/components/ui/Button";
import PressableScale from "@/components/ui/PressableScale";
import { AppText } from "@/components/ui/AppText";
import ScreenStates from "@/components/states/ScreenStates";
import SkeletonState from "@/components/states/SkeletonState";
import TripSheet from "@/components/sheets/TripSheet";
import TripExpenseSheet from "@/components/sheets/TripExpenseSheet";
import SettleSheet from "@/components/sheets/SettleSheet";
import MatchSplitwiseSheet from "@/components/sheets/MatchSplitwiseSheet";
import CloseDateSheet from "@/components/sheets/CloseDateSheet";
import { useCategoryById } from "@/lib/categories";
import { useAccountById } from "@/lib/accounts";
import { changeCloseDate, reopenTrip, tripDayNumber, tripDays, useTrip } from "@/lib/trips";
import { closeRange, monthTitle } from "@/lib/tripClose";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { count } from "@/lib/format/count";
import { formatCalendar, formatInstant } from "@/lib/format/date";
import { formatSpan } from "@/lib/format/period";
import { chartA11y, chartSummary, peakPhrase } from "@/lib/chartSummary";
import { appZone, calendarToday, dayKey, instantInZone } from "@/lib/zone";
import { toast } from "@/store/toast";
import { hintedLabel, useOnlineGate } from "@/lib/onlineGate";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { chartPalette, colors, radius, spacing } from "@/theme";

const BAR_COLORS = [colors.primary, colors.warning, colors.info, colors.success, colors.teal];

const CategoryBar = ({ category, total, max, index }: { category: string | null; total: number; max: number; index: number }) => {
  const cat = useCategoryById(category);
  return (
    <View style={styles.catRow}>
      <View style={styles.between}>
        <View style={[styles.inline, styles.shrink]}>
          <Icon name={(cat?.icon ?? "category") as IconName} size={13} color="inkDim" />
          <NameWithArchived archived={!!cat?.isArchived}>
            <AppText size="sm" weight="bold" numberOfLines={1} style={styles.shrink}>{cat?.name ?? "Uncategorised"}</AppText>
          </NameWithArchived>
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
      <ArchivedChip archived={entry.kind !== "settlement" && !!cat?.isArchived} chipSize={30}>
        <Icon
          name={entry.kind === "settlement" ? "transfer" : ((cat?.icon ?? "receipt") as IconName)}
          size={14} containerSize={30} containerRadius={10} container="square"
          gradient={entry.kind === "settlement" ? "green" : ((cat?.color ?? "accent") as ColorToken)}
        />
      </ArchivedChip>
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
  return onPress ? (
    <PressableScale onPress={onPress} scaleTo={0.98} accessibilityLabel={`${title}, ${meta}, your share ${formatMoney(entry.amount)}`} accessibilityHint="Edits this expense">
      {body}
    </PressableScale>
  ) : body;
};

/** "₹6,465.43 yours + ₹3,080.43 via Splitwise" — what makes up a person's matched amount. */
const routedNote = (m: { exact: number; routed: number }): string => {
  if (m.exact >= 0 && m.routed >= 0) return `${formatMoney(m.exact)} yours + ${formatMoney(m.routed)} via Splitwise`;
  return `Exact ${formatMoney(m.exact, { sign: "always" })} · Splitwise ${formatMoney(m.routed, { sign: "always" })}`;
};

const dayTitle = (key: string) => formatCalendar(key, "weekday");

// One trip, on one long page: what it's cost you, who owes whom, where your share went, how
// it went day by day, and every expense and settle-up in a day-by-day journal.
const TripDetailScreen = () => {
  const masked = usePrivacyMask();
  const router = useRouter();
  const { id, match } = useLocalSearchParams<{ id: string; match?: string }>();
  const q = useTrip(id);
  const { data, refetch } = q;
  const state = { ...q, hasData: data != null, notFound: !id || q.errorStatus === 404 };
  const reopenGate = useOnlineGate("Reopen");

  const editTripRef = useRef<BottomSheetModal>(null);
  const expenseRef = useRef<BottomSheetModal>(null);
  const settleRef = useRef<BottomSheetModal>(null);
  const matchRef = useRef<BottomSheetModal>(null);
  const closeDateRef = useRef<BottomSheetModal>(null);
  const changeGate = useOnlineGate("Change date");
  const [editing, setEditing] = useState<ITripExpense | null>(null);
  const [settling, setSettling] = useState<TripMemberBalance | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [showAllDays, setShowAllDays] = useState(false);

  // An import that could have changed someone's number sends us here asking to match Splitwise.
  // Refetched first, so the sheet opens on the balances the import just wrote.
  const [openMatch, setOpenMatch] = useState(false);
  useEffect(() => {
    if (match !== "1") return;
    router.setParams({ match: undefined });
    void refetch().then(() => setOpenMatch(true));
  }, [match, refetch, router]);
  // The sheet is only mounted once the trip has loaded, so it opens from here rather than
  // straight after the fetch.
  useEffect(() => {
    if (!openMatch || !data) return;
    setOpenMatch(false);
    matchRef.current?.present();
  }, [openMatch, data]);

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

  // The same header in every state: "Trip" with Edit dimmed until the record lands.
  const loadingActions = [{ kind: "edit" as const, label: "Edit trip", onPress: () => {}, disabled: true }];
  // No sheet is mounted yet without a trip, and a trip that's gone has nothing left to edit.
  if (!data || state.notFound) {
    return (
      <ScreenScaffold title="Trip" back actions={loadingActions} states={state}>
        <ScreenStates state={state} thing="trip" skeleton={<SkeletonState height={220} borderRadius={radius.lg} />}>{null}</ScreenStates>
      </ScreenScaffold>
    );
  }

  const { trip, totals, members, byCategory, byDay, plan } = data;
  const active = trip.status === "active";
  const closedOn = trip.closedOn ?? null;
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

  return (
    <ScreenScaffold
      title={`${trip.emoji} ${trip.name}`}
      back
      actions={[{ kind: "edit", label: "Edit trip", onPress: () => editTripRef.current?.present() }]}
      states={state}>
      {!active && (
        <Card style={styles.closedBanner}>
          <Icon name="check" size={16} color="success" />
          <View style={styles.grow}>
            <AppText size="xs" weight="bold">{closedOn ? `Closed ${formatCalendar(closedOn)}` : `Closed${trip.closedAt ? ` on ${formatInstant(trip.closedAt, "day")}` : ""}`}</AppText>
            {closedOn && (
              <AppText size="xs" color="inkSecondary">Counts as one expense in Trips on {formatCalendar(closedOn, "weekday")} ({monthTitle(closedOn.slice(0, 7))}). Balances still open can be settled any time.</AppText>
            )}
          </View>
          {closedOn && (
            <PressableScale
              onPress={() => closeDateRef.current?.present()}
              disabled={!changeGate.allowed}
              style={!changeGate.allowed && styles.gated}
              scaleTo={0.95}
              accessibilityRole="button"
              accessibilityLabel={hintedLabel(changeGate.label, changeGate.hint)}
            >
              <AppText size="xs" weight="black" color="primary">{changeGate.label}</AppText>
              {changeGate.hint && <AppText size="xs" color="inkDim">{changeGate.hint}</AppText>}
            </PressableScale>
          )}
          <PressableScale
            onPress={async () => {
              try { await reopenTrip(trip._id); toast.info(`${trip.name} reopened`); }
              catch (err) { toast.fromError(err, "Couldn't reopen the trip"); }
            }}
            disabled={!reopenGate.allowed}
            style={!reopenGate.allowed && styles.gated}
            scaleTo={0.95}
            accessibilityRole="button"
            accessibilityLabel={hintedLabel(reopenGate.label, reopenGate.hint)}
          >
            <AppText size="xs" weight="black" color="primary">{reopenGate.label}</AppText>
            {reopenGate.hint && <AppText size="xs" color="inkDim">{reopenGate.hint}</AppText>}
          </PressableScale>
        </Card>
      )}

      <Card style={styles.card}>
        {/* The header may cut a long name short; this is where all of it shows. */}
        <AppText size="md" weight="black">{trip.emoji} {trip.name}</AppText>
        <View style={styles.between}>
          <Caps>Your share</Caps>
          {active && dayNo && <Caps color="success">Day {dayNo} of {length}</Caps>}
        </View>
        <Money value={totals.myShare} size="xl" weight="black" />
        <AppText size="xs" color="inkDim">
          {formatSpan(new Date(trip.startDate), new Date(trip.endDate))} · {members.length === 0 ? "just you" : count(members.length + 1, "person", "people")} · {formatMoney(totals.myShare / length)} a day
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
        <StatRow
          size="sm"
          surface="plain"
          style={styles.three}
          items={[
            { label: "You paid", amount: totals.paid },
            { label: "Whole trip", amount: totals.wholeTrip },
            {
              label: totals.balance >= 0 ? "Owed to you" : "You owe",
              amount: Math.abs(totals.balance),
              tone: totals.balance > 0 ? "success" : totals.balance < 0 ? "warning" : "ink",
            },
          ]}
        />
      </Card>

      {active && (
        <View style={styles.actions}>
          <View style={styles.grow}><Button label="Expense" icon="add" onPress={addExpense} /></View>
          <View style={styles.grow}><Button label="Import" icon="download" variant="secondary" onPress={() => router.push({ pathname: "/trip-import", params: { id: trip._id } })} /></View>
        </View>
      )}

      {members.length > 0 && (
        <>
          <View style={styles.between}>
            <Caps header>People</Caps>
            {plan ? (
              <PressableScale onPress={() => matchRef.current?.present()} scaleTo={0.95} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit the Splitwise match">
                <AppText size="xs" weight="black" color={plan.stale ? "warning" : "success"}>
                  {plan.stale ? "Splitwise numbers may be out of date · Update" : `Matches Splitwise · ${formatInstant(plan.savedAt, "day")}`}
                </AppText>
              </PressableScale>
            ) : members.length > 1 && (
              <PressableScale onPress={() => matchRef.current?.present()} scaleTo={0.95} hitSlop={8} accessibilityRole="button" accessibilityLabel="Match Splitwise's simplified debts">
                <AppText size="xs" weight="black" color="primary">Match Splitwise</AppText>
              </PressableScale>
            )}
          </View>
          <Card style={styles.list}>
            {members.map((m) => {
              // Splitwise routes this person's debt through others: nothing for them to pay you,
              // but not "settled" either — said so, so nobody wonders where it went.
              const routedAway = !!plan && m.balance === 0 && m.exact !== 0;
              return (
                <View key={m.account} style={[styles.personBlock, routedAway && styles.dim]}>
                  <View style={styles.personLine}>
                    <Icon name="person" size={14} containerSize={30} containerRadius={15} container="square" gradient="violet" />
                    <AppText size="sm" weight="bold" style={styles.grow}>{m.name}</AppText>
                    {m.balance === 0 ? (
                      <AppText size="xs" color="inkDim">{routedAway ? formatMoney(0) : "settled"}</AppText>
                    ) : (
                      <>
                        <AppText size="sm" weight="bold" color={m.balance > 0 ? "success" : "warning"}>
                          {m.balance > 0 ? `owes ${formatMoney(m.balance)}` : `you owe ${formatMoney(-m.balance)}`}
                        </AppText>
                        <PressableScale onPress={() => { setSettling(m); settleRef.current?.present(); }} scaleTo={0.95} style={styles.settleBtn} accessibilityLabel={`Settle with ${m.name}`}>
                          <AppText size="xs" weight="bold">Settle</AppText>
                        </PressableScale>
                      </>
                    )}
                  </View>
                  {/* Under the row, full width: beside the amount and Settle it wrapped into a sliver. */}
                  {routedAway ? (
                    <AppText size="xs" color="inkDim" style={styles.personNote}>{formatMoney(Math.abs(m.exact))} routed through others</AppText>
                  ) : m.routed !== 0 ? (
                    <AppText size="xs" color="inkDim" style={styles.personNote}>{routedNote(m)}</AppText>
                  ) : null}
                </View>
              );
            })}
          </Card>
        </>
      )}

      {byCategory.length > 0 && (
        <>
          <Caps header>Your share by category</Caps>
          <Card style={styles.card}>
            {byCategory.map((c, i) => <CategoryBar key={c.category ?? "none"} category={c.category} total={c.total} max={maxCat} index={i} />)}
          </Card>
        </>
      )}

      {chartDays.length > 1 && byDay.length > 0 && (
        <>
          <Caps header>Spend by day</Caps>
          <Card style={styles.card}>
            <View
              style={styles.chart}
              {...chartA11y(chartSummary({
                title: "Spend by day",
                masked,
                parts: [peakPhrase(chartDays.map((d) => d.total), chartDays.map((d) => dayTitle(d.date)), formatMoney, { word: "biggest day" })],
              }))}
            >
              {chartDays.map((d) => (
                <View key={d.date} style={[styles.chartBar, d.total === 0 ? styles.chartBarEmpty : { height: `${Math.max(6, (d.total / maxDay) * 100)}%`, backgroundColor: d.date === biggest?.date ? colors.teal : colors.primary }]} />
              ))}
            </View>
            {biggest && <AppText size="xs" color="inkDim" style={styles.center}>Biggest day: {dayTitle(biggest.date)} · {formatMoney(biggest.total)}</AppText>}
          </Card>
        </>
      )}

      <Caps header>Day by day</Caps>
      {days.length === 0 && (
        <Card><AppText size="sm" color="inkDim">Nothing yet. Add what's been spent — who paid, and who it's split between.</AppText></Card>
      )}
      {visibleDays.map((d, i) => {
        const expanded = openDay === d.date || (openDay === null && i === 0);
        return (
          <Card key={d.date} style={styles.card}>
            <PressableScale
              onPress={() => setOpenDay(expanded ? "" : d.date)}
              scaleTo={0.99}
              accessibilityLabel={`${dayTitle(d.date)}, ${count(d.entries.length, "entry", "entries")}, ${d.spend === 0 ? "settle-ups only" : formatMoney(d.spend)}`}
              accessibilityState={{ expanded }}
            >
              <View style={styles.between}>
                <View>
                  <AppText size="sm" weight="bold">{dayTitle(d.date)}</AppText>
                  <AppText size="xs" color="inkDim">{count(d.entries.length, "entry", "entries")}</AppText>
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

      <TripSheet ref={editTripRef} trip={trip} onDeleted={goBackOrHome} />
      {closedOn && (
        <CloseDateSheet
          ref={closeDateRef}
          mode="change"
          tripName={trip.name}
          amount={data.totals.myShare}
          range={closeRange(dayKey(new Date(trip.startDate), zone), dayKey(new Date(), zone))}
          expenseDays={data.expenses.map((e) => dayKey(new Date(e.occurredAt), zone))}
          initial={closedOn}
          onConfirm={async (day) => {
            await changeCloseDate(trip._id, day);
            toast.success(`${trip.name} now counts on ${formatCalendar(day)}`);
          }}
        />
      )}
      <TripExpenseSheet ref={expenseRef} tripId={trip._id} members={members} expense={editing} defaultDate={defaultDate} />
      <MatchSplitwiseSheet ref={matchRef} tripId={trip._id} members={members} plan={plan} />
      <SettleSheet ref={settleRef} tripId={trip._id} member={settling} />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1, minWidth: 0 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  inline: { flexDirection: "row", alignItems: "center", gap: 6 },
  right: { alignItems: "flex-end" },
  center: { textAlign: "center" },
  card: { gap: spacing.sm },
  list: { paddingVertical: 2 },
  closedBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  three: { marginTop: spacing.xs },
  bar: { height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
  actions: { flexDirection: "row", gap: spacing.sm },
  dim: { opacity: 0.5 },
  gated: { opacity: 0.45 },
  personBlock: { paddingVertical: 9, gap: 4, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  personLine: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  personNote: { marginLeft: 30 + spacing.md },
  settleBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.13)" },
  catRow: { gap: 4 },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 64 },
  chartBar: { flex: 1, borderRadius: 3 },
  chartBarEmpty: { height: 3, backgroundColor: "rgba(255,255,255,0.10)" },
  dayBody: { gap: 2, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  entry: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 6 },
});

export default TripDetailScreen;
