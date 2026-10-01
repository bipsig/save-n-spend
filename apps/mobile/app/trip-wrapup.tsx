import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import BackButton from "@/components/shell/BackButton";
import Card from "@/components/data/Card";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import Icon from "@/components/ui/Icon";
import Money from "@/components/ui/Money";
import { AppText } from "@/components/ui/AppText";
import SkeletonState from "@/components/states/SkeletonState";
import { useCategoryById } from "@/lib/categories";
import { haptics } from "@/lib/haptics";
import formatMoney, { roundToRupee, usePrivacyMask } from "@/lib/money";
import { closeTrip, tripDays, useTrip } from "@/lib/trips";
import { toast } from "@/store/toast";
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

const TopCategory = ({ id, pct }: { id: string | null; pct: number }) => {
  const cat = useCategoryById(id);
  return (
    <View style={styles.grow}>
      <AppText size="md" weight="black">{pct}%</AppText>
      <AppText size="xs" color="inkDim" numberOfLines={1}>on {(cat?.name ?? "one category").toLowerCase()}</AppText>
    </View>
  );
};

// Wrapping up a trip: what's in, what's still open, a decision for each leftover balance, and
// the trip in numbers — then close. Closing is always allowed; kept balances simply stay on
// each person, to settle whenever.
const TripWrapUpScreen = () => {
  usePrivacyMask();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useTrip(id);
  const [choice, setChoice] = useState<Record<string, "keep" | "letGo">>({});
  const [busy, setBusy] = useState(false);

  // Small balances start on "Let go"; the rest on "Keep".
  useEffect(() => {
    if (!data) return;
    setChoice(Object.fromEntries(data.members.filter((m) => m.balance !== 0)
      .map((m) => [m.account, Math.abs(m.balance) <= LET_GO_BELOW ? "letGo" : "keep"])));
  }, [data]);

  if (!data) return <ScreenScaffold header={<BackButton />}><SkeletonState height={240} borderRadius={radius.lg} /></ScreenScaffold>;

  const { trip, totals, members, expenses, byCategory } = data;
  const open = members.filter((m) => m.balance !== 0);
  const uncategorised = expenses.filter((e) => !e.category).length;
  const lastImport = expenses.filter((e) => e.source === "splitwise").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const days = tripDays(trip.startDate, trip.endDate);
  const top = byCategory[0];
  const topPct = top && totals.myShare > 0 ? Math.round((top.total / totals.myShare) * 100) : 0;

  const close = async () => {
    setBusy(true);
    try {
      await closeTrip(trip._id, open.filter((m) => choice[m.account] === "letGo").map((m) => m.account));
      haptics.success();
      toast.success(`${trip.name} closed · your share ${formatMoney(totals.myShare)}`);
      router.back();
    }
    catch (err) {
      haptics.error();
      toast.error(err instanceof Error ? err.message : "Couldn't close the trip");
    }
    finally {
      setBusy(false);
    }
  };

  return (
    <ScreenScaffold header={<View style={styles.head}><BackButton /><AppText size="xl" weight="black" numberOfLines={1} style={styles.grow}>Wrap up {trip.name}</AppText></View>}>
      <Card style={styles.card}>
        <Step
          done={expenses.length > 0}
          title="All expenses in"
          detail={`${expenses.length} ${expenses.length === 1 ? "expense" : "expenses"}${lastImport ? ` · Splitwise imported ${new Date(lastImport.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}`}
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
                <Chip label="Keep" selected={choice[m.account] !== "letGo"} onPress={() => setChoice((c) => ({ ...c, [m.account]: "keep" }))} />
                <Chip label="Let go" selected={choice[m.account] === "letGo"} onPress={() => setChoice((c) => ({ ...c, [m.account]: "letGo" }))} />
              </View>
            ))}
          </Card>
          <AppText size="xs" color="inkDim" style={styles.lh}>
            Kept balances stay on each person and can be settled any time. Letting go of what someone owes you adds it to your share; letting go of what you owe clears it.
          </AppText>
        </>
      )}

      <LinearGradient colors={["rgba(20,184,166,0.22)", "rgba(109,92,246,0.18)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summary}>
        <AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>Your {trip.name} in numbers</AppText>
        <View style={styles.three}>
          <View style={styles.grow}><Money value={totals.myShare} size="md" weight="black" /><AppText size="xs" color="inkDim">your share</AppText></View>
          <View style={styles.grow}><Money value={roundToRupee(totals.myShare / days)} size="md" weight="black" /><AppText size="xs" color="inkDim">a day</AppText></View>
          {top ? <TopCategory id={top.category} pct={topPct} /> : <View style={styles.grow} />}
        </View>
      </LinearGradient>

      <Button label="Close trip" loading={busy} onPress={close} />
      <Button label="Not yet" variant="ghost" onPress={() => router.back()} />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  grow: { flex: 1, minWidth: 0 },
  caps: { letterSpacing: 1.2, textTransform: "uppercase" },
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
