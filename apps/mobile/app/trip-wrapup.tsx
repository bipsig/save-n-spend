import { useEffect, useRef, useState } from "react";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { goBackOrHome } from "@/lib/navigation";
import { LinearGradient } from "expo-linear-gradient";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import Icon from "@/components/ui/Icon";
import { NameWithArchived } from "@/components/ui/ArchivedMark";
import Money from "@/components/ui/Money";
import Caps from "@/components/ui/Caps";
import { AppText } from "@/components/ui/AppText";
import SkeletonState from "@/components/states/SkeletonState";
import CloseDateSheet from "@/components/sheets/CloseDateSheet";
import ScreenStates from "@/components/states/ScreenStates";
import { useCategoryById } from "@/lib/categories";
import { haptics } from "@/lib/haptics";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { count } from "@/lib/format/count";
import { formatCalendar, formatInstant } from "@/lib/format/date";
import { formatPct, percentOf } from "@/lib/format/pct";
import { closeTrip, tripDays, useTrip } from "@/lib/trips";
import { holderFor } from "@/lib/idempotency";
import { useOnlineGate } from "@/lib/onlineGate";
import { toast } from "@/store/toast";
import { closeRange, defaultCloseDay } from "@/lib/tripClose";
import { dayKey, useAppZone } from "@/lib/zone";
import { radius, spacing } from "@/theme";

/** Balances at or under this (paise) start on "Let go" — ₹50, as agreed. */
const LET_GO_BELOW = 5_000;

const Step = ({ done, title, detail, warn }: { done: boolean; title: string; detail: string; warn?: boolean }) => (
  <View style={styles.step}>
    <View style={[styles.check, done && styles.checkOn]}>{done && <Icon name="check" size={12} color="ink" />}</View>
    <View style={styles.grow}>
      <AppText size="sm" weight="bold">{title}</AppText>
      <AppText size="xs" color={warn ? "warning" : "inkDim"}>{detail}</AppText>
    </View>
  </View>
);

const TopCategory = ({ id, pct }: { id: string | null; pct: string }) => {
  const cat = useCategoryById(id);
  return (
    <View style={styles.grow}>
      <AppText size="md" weight="black">{pct}</AppText>
      <NameWithArchived archived={!!cat?.isArchived}>
        <AppText size="xs" color="inkDim" numberOfLines={1} style={styles.shrink}>on {(cat?.name ?? "one category").toLowerCase()}</AppText>
      </NameWithArchived>
    </View>
  );
};

// Wrapping up a trip: what's in, what's still open, a decision for each leftover balance, and
// the trip in numbers — then close. Closing is always allowed; kept balances simply stay on
// each person, to settle whenever.
const TripWrapUpScreen = () => {
  usePrivacyMask();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useTrip(id);
  const { data } = q;
  const state = { ...q, hasData: data != null, notFound: !id || q.errorStatus === 404 };
  const closeGate = useOnlineGate("Close trip");
  const [choice, setChoice] = useState<Record<string, "keep" | "letGo">>({});
  const sheet = useRef<BottomSheetModal>(null);
  const zone = useAppZone();

  // Small balances start on "Let go"; the rest on "Keep".
  useEffect(() => {
    if (!data) return;
    setChoice(Object.fromEntries(data.members.filter((m) => m.balance !== 0)
      .map((m) => [m.account, Math.abs(m.balance) <= LET_GO_BELOW ? "letGo" : "keep"])));
  }, [data]);

  if (!data || state.notFound) {
    return (
      <ScreenScaffold title="Wrap up" back states={state}>
        <ScreenStates state={state} thing="trip" skeleton={<SkeletonState height={240} borderRadius={radius.lg} />}>{null}</ScreenStates>
      </ScreenScaffold>
    );
  }

  const { trip, totals, members, expenses, byCategory } = data;
  const open = members.filter((m) => m.balance !== 0);
  const uncategorised = expenses.filter((e) => !e.category).length;
  const lastImport = expenses.filter((e) => e.source === "splitwise").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const days = tripDays(trip.startDate, trip.endDate);
  const top = byCategory[0];
  const topPct = formatPct(top ? percentOf(top.total, totals.myShare) : 0);

  const range = closeRange(dayKey(new Date(trip.startDate), zone), dayKey(new Date(), zone));
  const expenseDays = expenses.map((e) => dayKey(new Date(e.occurredAt), zone));

  // The sheet keeps itself open with the reason when this throws.
  const close = async (closedOn: string) => {
    const letGo = open.filter((m) => choice[m.account] === "letGo").map((m) => m.account);
    // The choices start from the same balances on every open, so the key outlives the screen.
    const idem = holderFor(`trip:${trip._id}:close`);
    await closeTrip(trip._id, letGo, closedOn, { idempotencyKey: idem.keyFor("POST", `/trips/${trip._id}/close`, { letGo, closedOn }) });
    idem.reset();
    haptics.success();
    toast.success(`${trip.name} closed · ${formatMoney(totals.myShare)} in Trips on ${formatCalendar(closedOn)}`);
    goBackOrHome();
  };

  return (
    <ScreenScaffold title={`Wrap up ${trip.name}`} back states={state}>
      <Card style={styles.card}>
        <Step
          done={expenses.length > 0}
          title="All expenses in"
          detail={`${count(expenses.length, "expense")}${lastImport ? ` · Splitwise imported ${formatInstant(lastImport.createdAt, "day")}` : ""}`}
        />
        <Step
          done={uncategorised === 0}
          title="Categories set"
          detail={uncategorised === 0 ? "Every expense has one" : `${uncategorised} without a category`}
          warn={uncategorised > 0}
        />
        <Step
          done={open.length === 0}
          title="Balances"
          detail={open.length === 0 ? "Everyone's settled" : `${open.length} still open · decide below`}
          warn={open.length > 0}
        />
      </Card>

      {open.length > 0 && (
        <>
          <Card style={styles.list}>
            {open.map((m) => (
              <View key={m.account} style={styles.balanceRow}>
                <AppText size="sm" style={styles.grow}>
                  {m.balance > 0 ? <><AppText size="sm" weight="bold">{m.name}</AppText> owes {formatMoney(m.balance)}</> : <>You owe <AppText size="sm" weight="bold">{m.name}</AppText> {formatMoney(-m.balance)}</>}
                </AppText>
                <Chip label="Keep" accessibilityLabel={`Keep ${m.name}'s balance`} selected={choice[m.account] !== "letGo"} onPress={() => setChoice((c) => ({ ...c, [m.account]: "keep" }))} />
                <Chip label="Let go" accessibilityLabel={`Let go of ${m.name}'s balance`} selected={choice[m.account] === "letGo"} onPress={() => setChoice((c) => ({ ...c, [m.account]: "letGo" }))} />
              </View>
            ))}
          </Card>
          <AppText size="xs" color="inkDim" style={styles.lh}>
            Kept balances stay on each person and can be settled any time. Letting go of what someone owes you adds it to your share; letting go of what you owe clears it.
          </AppText>
        </>
      )}

      <LinearGradient colors={["rgba(20,184,166,0.22)", "rgba(109,92,246,0.18)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summary}>
        <Caps>Your {trip.name} in numbers</Caps>
        <View style={styles.three}>
          <View style={styles.grow}><Money value={totals.myShare} size="md" weight="black" /><AppText size="xs" color="inkDim">your share</AppText></View>
          <View style={styles.grow}><Money value={totals.myShare / days} size="md" weight="black" /><AppText size="xs" color="inkDim">a day</AppText></View>
          {top ? <TopCategory id={top.category} pct={topPct} /> : <View style={styles.grow} />}
        </View>
      </LinearGradient>

      <Button label={closeGate.label} icon={closeGate.icon} hint={closeGate.hint} disabled={!closeGate.allowed} onPress={() => sheet.current?.present()} />
      <Button label="Not yet" variant="ghost" onPress={goBackOrHome} />
      <CloseDateSheet
        ref={sheet}
        mode="close"
        tripName={trip.name}
        amount={totals.myShare}
        range={range}
        expenseDays={expenseDays}
        initial={defaultCloseDay(expenseDays, range)}
        onConfirm={close}
      />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1, minWidth: 0 },
  lh: { lineHeight: 17 },
  card: { gap: spacing.md },
  list: { paddingVertical: 2 },
  step: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  check: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: "rgba(255,255,255,0.35)", alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: "#9B8CFF", borderColor: "#9B8CFF" },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  summary: { borderRadius: 20, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  three: { flexDirection: "row", gap: spacing.sm },
});

export default TripWrapUpScreen;
