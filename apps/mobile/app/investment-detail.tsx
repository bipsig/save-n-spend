import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { goBackOrHome } from "@/lib/navigation";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { ITransaction } from "@save-n-spend/types";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import Sparkline from "@/components/charts/Sparkline";
import Money from "@/components/ui/Money";
import Icon from "@/components/ui/Icon";
import Button from "@/components/ui/Button";
import PressableScale from "@/components/ui/PressableScale";
import { AppText } from "@/components/ui/AppText";
import Caps from "@/components/ui/Caps";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { StatRow } from "@/components/ui/StatTile";
import ScreenStates from "@/components/states/ScreenStates";
import SkeletonState from "@/components/states/SkeletonState";
import RevalueSheet from "@/components/sheets/RevalueSheet";
import EditAccountSheet from "@/components/sheets/EditAccountSheet";
import DeleteInvestmentSheet, { type DeleteInvestmentSummary } from "@/components/sheets/DeleteInvestmentSheet";
import { useBills } from "@/lib/bills";
import { toast } from "@/store/toast";
import { useAccountById, useAccounts } from "@/lib/accounts";
import { useAccountStore } from "@/store/accounts";
import { formatTxnDate } from "@/lib/date";
import formatMoney, { formatMoneyExact, usePrivacyMask } from "@/lib/money";
import { formatPct } from "@/lib/format/pct";
import { formatInstant } from "@/lib/format/date";
import { returnPct, useInvestmentHistory, useInvestments, useInvestmentTrend } from "@/lib/investments";
import { holdingSparkSummary } from "@/lib/chartSummaries";
import { mergeScreenStates } from "@/lib/screenStates";
import InvestmentsExportSheet, { type InvestmentsExportHandle } from "@/components/sheets/InvestmentsExportSheet";
import TrendsView, { INVEST_TABS, type InvestTab } from "@/components/investments/TrendsView";
import type { IconName } from "@/lib/icons";
import { colors, radius, spacing } from "@/theme";
import type { HeaderAction } from "@/lib/screenHeader";
import type { ColorToken } from "@/theme";
import { signTone } from "@/lib/signTone";

const gainColor = (n: number): ColorToken => signTone(n);

type HistoryRow = { icon: IconName; tint: ColorToken; soft: ColorToken; title: string; amt: string; amtColor: ColorToken };

// The signed effect of one transaction on THIS holding's value.
const effectOn = (t: ITransaction, id: string): number => {
  if (t.type === "transfer") {
    if (t.toAccount === id) return t.amount;   // contribution in
    if (t.account === id) return -t.amount;    // redemption out
    return 0;
  }
  if (t.type === "positiveAdjustment") return t.amount;   // value grew
  if (t.type === "negativeAdjustment") return -t.amount;  // value fell
  return 0;
};

const InvestmentDetailScreen = () => {
  const masked = usePrivacyMask();
  const router = useRouter();
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const account = useAccountById(id);
  const accountsLoaded = useAccountStore((s) => s.loaded);
  const allAccounts = useAccounts();

  const history = useInvestmentHistory(id);
  const txns = history.data;
  const revalueRef = useRef<BottomSheetModal>(null);
  const exportRef = useRef<InvestmentsExportHandle>(null);
  const editRef = useRef<BottomSheetModal>(null);
  const deleteRef = useRef<BottomSheetModal>(null);
  const billsQuery = useBills();
  const bills = billsQuery.items;
  // The server's figures for this holding — the yearly return is worked out there.
  const portfolioQuery = useInvestments();
  const portfolio = portfolioQuery.data;
  const holding = portfolio?.holdings.find((h) => h.accountId === id) ?? null;
  const trendQuery = useInvestmentTrend();
  const trendData = trendQuery.data;
  const [tab, setTab] = useState<InvestTab>("overview");

  // The page draws once its own history is in; the yearly figure, Trends and the SIP names
  // join when theirs are, so their failures only ever show as the refresh strip.
  const notFound = !id || (accountsLoaded && !account) || history.errorStatus === 404;
  const merged = mergeScreenStates(
    { ...history, hasData: txns !== null },
    { ...portfolioQuery, hasData: portfolio !== null },
    { ...trendQuery, hasData: trendData !== null },
    { ...billsQuery, hasData: billsQuery.data !== null },
  );
  const hasData = txns !== null && !!account;
  const state = { ...merged, hasData, notFound, error: hasData ? merged.error : history.error };

  // Arriving from the hub's "add when it started" nudge opens the editor straight away.
  const [autoEdited, setAutoEdited] = useState(false);
  useEffect(() => {
    if (edit === "1" && !autoEdited && account && txns) {
      setAutoEdited(true);
      editRef.current?.present();
    }
  }, [edit, autoEdited, account, txns]);

  // The same header while loading and once loaded; the actions wait for the record.
  // The sheets behind the actions mount with the page, once the history is in.
  const ready = !!account && !!txns && !notFound;
  const headerProps = {
    title: account && !notFound ? account.name : "Investment",
    back: true,
    actions: [
      { kind: "export", label: "Export investment", onPress: () => exportRef.current?.present(), disabled: !ready },
      { kind: "edit", label: "Edit investment", onPress: () => editRef.current?.present(), disabled: !ready },
    ] satisfies HeaderAction[],
  };

  if (!account || !txns || notFound) {
    return (
      <ScreenScaffold {...headerProps} states={state}>
        <ScreenStates state={state} thing="investment" skeleton={<DetailSkeleton />}>
          {null}
        </ScreenStates>
      </ScreenScaffold>
    );
  }

  // Cost basis and gain from the holding's own history; current is the live balance.
  const contributions = txns.filter((t) => t.type === "transfer" && t.toAccount === id).reduce((s, t) => s + t.amount, 0);
  const redemptions = txns.filter((t) => t.type === "transfer" && t.account === id).reduce((s, t) => s + t.amount, 0);
  // Opening balance is the initial cost basis, not gain (see investmentService).
  const invested = account.startingBalance + contributions - redemptions;
  const current = account.balance;
  const gain = current - invested;
  const pct = returnPct(invested, gain);

  // Value over time — oldest first. Counted back from today's value rather than up from the
  // opening balance: a holding can start worth something other than what went in (bought at
  // ₹1L, worth ₹90k when added), so only the current value is a sure anchor.
  const chronological = [...txns].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  const totalEffect = chronological.reduce((sum, t) => sum + effectOn(t, id!), 0);
  const line: number[] = [current - totalEffect];
  let running = current - totalEffect;
  for (const t of chronological) { running += effectOn(t, id!); line.push(running); }

  const annual = holding?.annualReturnStatus === "ok" ? holding.annualReturn : null;

  const nameOf = (accId?: string | null) => (accId ? allAccounts.find((a) => a._id === accId)?.name : undefined);

  // What deleting it would take with it, for the confirm sheet to spell out.
  const moneyIn = txns.filter((t) => t.type === "transfer" && t.toAccount === id);
  const moneyOut = txns.filter((t) => t.type === "transfer" && t.account === id);
  const uniqueNames = (ids: (string | null | undefined)[]) =>
    [...new Set(ids.map((x) => nameOf(x) ?? "another account"))];
  const deleteSummary: DeleteInvestmentSummary = {
    id: account._id,
    name: account.name,
    moneyIn: { count: moneyIn.length, total: contributions, from: uniqueNames(moneyIn.map((t) => t.account)) },
    moneyOut: { count: moneyOut.length, total: redemptions, to: uniqueNames(moneyOut.map((t) => t.toAccount)) },
    valueUpdates: txns.filter((t) => t.type === "positiveAdjustment" || t.type === "negativeAdjustment").length,
    sipBills: bills.filter((b) => b.toInvestment === id).map((b) => b.name),
  };

  // In the account zone (U4): a start on 1 March in India is still 28 February in UTC.
  const sinceLabel = holding?.investedSince ? formatInstant(holding.investedSince, "month") : null;
  const signedMoney = (n: number) => formatMoney(n, { sign: "always" });


  const historyRow = (t: ITransaction): HistoryRow => {
    const eff = effectOn(t, id!);
    if (t.type === "transfer" && t.toAccount === id) {
      return { icon: "add", tint: "success", soft: "successSoft", title: `Invested from ${nameOf(t.account) ?? "an account"}`, amt: signedMoney(t.amount), amtColor: "success" };
    }
    if (t.type === "transfer" && t.account === id) {
      return { icon: "transfer", tint: "info", soft: "infoSoft", title: `Redeemed to ${nameOf(t.toAccount) ?? "an account"}`, amt: signedMoney(-t.amount), amtColor: "inkDim" };
    }
    const up = eff >= 0;
    return { icon: up ? "income" : "expenses", tint: up ? "success" : "danger", soft: up ? "successSoft" : "dangerSoft", title: "Value updated", amt: signedMoney(eff), amtColor: gainColor(eff) };
  };

  return (
    <ScreenScaffold {...headerProps} states={state}>
      {trendData && trendData.points.length > 0 && (
        <SegmentedControl size="sm" accessibilityLabel="View" segments={INVEST_TABS} value={tab} onChange={setTab} />
      )}
      {tab === "trends" && trendData && trendData.points.length > 0 ? (
        <TrendsView trend={trendData} initialScope={id} locked />
      ) : (
        <>
      <Card style={styles.card}>
        {/* The full name: the header shrinks a long one and then cuts it off. */}
        <AppText size="md" weight="black" style={styles.fullName}>{account.name}</AppText>
        <Caps>{account.investmentKind ?? "Investment"}</Caps>
        <Money value={current} weight="black" size="xl" />
        <AppText size="sm" weight="bold" color={gainColor(gain)} style={styles.delta}>
          {signedMoney(gain)}{pct !== null ? ` (${formatPct(pct, { kind: "return" })})` : ""}
        </AppText>
        {line.length >= 2 && (
          <Sparkline values={line} summary={holdingSparkSummary(line, chronological[0]?.occurredAt, masked)} />
        )}
      </Card>

      <Card>
        <StatRow
          surface="plain"
          gap={spacing.md}
          items={[
            { label: "Invested", amount: invested, format: (p) => formatMoneyExact(p) },
            { label: "Gain", amount: gain, signed: true, format: (p) => formatMoneyExact(p, { sign: "always" }), tone: gainColor(gain) },
            annual !== null
              ? { label: "Per year", text: formatPct(annual * 100, { kind: "return" }), tone: gainColor(annual) }
              : { label: "Per year", text: "—", tone: "inkDim" },
          ]}
        />
      </Card>

      {/* Why the yearly figure is what it is — or how to get one. */}
      {holding?.annualReturnStatus === "noStartDate" ? (
        <PressableScale onPress={() => editRef.current?.present()} scaleTo={0.98} accessibilityRole="button">
          <AppText size="xs" weight="semibold" color="primary">Add when it started to see the yearly return ›</AppText>
        </PressableScale>
      ) : (
        <AppText size="xs" color="inkDim">
          {holding?.annualReturnStatus === "ok"
            ? `${pct !== null ? `${formatPct(pct, { kind: "return" })} all time. ` : ""}Per year counts each rupee for the time it's been invested${sinceLabel ? `, since ${sinceLabel}` : ""}.`
            : holding?.annualReturnStatus === "tooEarly"
              ? "A yearly return shows once your money has been in for about three months."
              : ""}
        </AppText>
      )}

      <View style={styles.ctaRow}>
        <View style={styles.ctaHalf}>
          <Button label="Update value" variant="secondary" onPress={() => revalueRef.current?.present()} />
        </View>
        <View style={styles.ctaHalf}>
          <Button label="Invest more" icon="add" onPress={() => router.push({ pathname: "/add-transaction", params: { mode: "invest" } })} />
        </View>
      </View>

      {/* Redeem — a transfer out of this holding, back to a spendable account. Reuses the
          Add-Transaction money path with the source preset to this investment. */}
      <Button
        label="Redeem"
        variant="ghost"
        icon="transfer"
        onPress={() => router.push({ pathname: "/add-transaction", params: { redeemFrom: account._id } })}
      />

      {txns.length > 0 && (
        <>
          <Caps header style={styles.sectionLabel}>History</Caps>
          <Card style={styles.card}>
            {txns.map((t) => {
              const row = historyRow(t);
              return (
                <View key={t._id} style={styles.hRow}>
                  <Icon name={row.icon} size={14} containerSize={30} containerRadius={9} container="square" containerColor={row.soft} color={row.tint} />
                  <View style={styles.hInfo}>
                    <AppText size="sm" weight="bold">{row.title}</AppText>
                    <AppText size="xs" color="inkDim">{formatTxnDate(t.occurredAt)}</AppText>
                  </View>
                  <AppText size="sm" weight="bold" color={row.amtColor}>{row.amt}</AppText>
                </View>
              );
            })}
          </Card>
        </>
      )}

      <Button label="Delete investment" variant="ghost" icon="delete" onPress={() => deleteRef.current?.present()} />
        </>
      )}

      <InvestmentsExportSheet ref={exportRef} holdingId={id} />

      <RevalueSheet
        ref={revalueRef}
        holdings={[{ accountId: account._id, name: account.name, invested, current }]}
      />

      <EditAccountSheet ref={editRef} account={account} invested={invested} />

      <DeleteInvestmentSheet
        ref={deleteRef}
        summary={deleteSummary}
        onDeleted={() => {
          goBackOrHome();
          toast.success(`${account.name} deleted`);
        }}
      />
    </ScreenScaffold>
  );
};

// The value card, the stat row and the two buttons, before the history is in.
const DetailSkeleton = () => (
  <View style={styles.skeleton}>
    <SkeletonState height={170} borderRadius={radius.lg} />
    <SkeletonState height={76} borderRadius={radius.lg} />
    <SkeletonState height={48} borderRadius={radius.lg} />
  </View>
);

const styles = StyleSheet.create({
  skeleton: { gap: spacing.lg },
  card: { gap: spacing.sm },
  fullName: { lineHeight: 23 },
  delta: { marginTop: 2 },
  ctaRow: { flexDirection: "row", gap: spacing.md },
  ctaHalf: { flex: 1 },
  sectionLabel: { paddingHorizontal: 2 },
  hRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  hInfo: { flex: 1, gap: 2 },
});

export default InvestmentDetailScreen;
