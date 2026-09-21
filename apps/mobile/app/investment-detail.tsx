import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { ITransaction } from "@save-n-spend/types";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import BackButton from "@/components/shell/BackButton";
import Card from "@/components/data/Card";
import Sparkline from "@/components/charts/Sparkline";
import Money from "@/components/ui/Money";
import Icon from "@/components/ui/Icon";
import Button from "@/components/ui/Button";
import PressableScale from "@/components/ui/PressableScale";
import { AppText } from "@/components/ui/AppText";
import EmptyState from "@/components/states/EmptyState";
import RevalueSheet from "@/components/sheets/RevalueSheet";
import EditAccountSheet from "@/components/sheets/EditAccountSheet";
import { useAccountById, useAccounts } from "@/lib/accounts";
import { useAccountStore } from "@/store/accounts";
import { get } from "@/lib/api";
import { formatTxnDate } from "@/lib/date";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { returnPct } from "@/lib/investments";
import type { IconName } from "@/lib/icons";
import { colors, spacing } from "@/theme";
import type { ColorToken } from "@/theme";

const gainColor = (n: number): ColorToken => (n > 0 ? "success" : n < 0 ? "danger" : "inkDim");

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
  usePrivacyMask();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const account = useAccountById(id);
  const allAccounts = useAccounts();

  const [txns, setTxns] = useState<ITransaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const revalueRef = useRef<BottomSheetModal>(null);
  const editRef = useRef<BottomSheetModal>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      // The investment-specific history — includes value-updates (adjustments), which the
      // general transactions feed drops.
      const res = await get<ITransaction[]>(`/investments/${id}/history`);
      setTxns(res);
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load history");
    }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const afterChange = () => {
    void load();
    void useAccountStore.getState().load();
  };

  const header = (
    <View style={styles.head}>
      <BackButton />
      <AppText size="xl" weight="black" numberOfLines={1} style={styles.headTitle}>{account?.name ?? "Investment"}</AppText>
      {account && (
        <PressableScale onPress={() => editRef.current?.present()} scaleTo={0.9} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit investment">
          <Icon name="edit" size={20} color="inkDim" />
        </PressableScale>
      )}
    </View>
  );

  if (!account) {
    return (
      <ScreenScaffold header={header}>
        <EmptyState icon="investments" title="Not found" subtitle="This investment may have been removed." />
      </ScreenScaffold>
    );
  }

  // Cost basis and gain from the holding's own history; current is the live balance.
  const contributions = (txns ?? []).filter((t) => t.type === "transfer" && t.toAccount === id).reduce((s, t) => s + t.amount, 0);
  const redemptions = (txns ?? []).filter((t) => t.type === "transfer" && t.account === id).reduce((s, t) => s + t.amount, 0);
  // Opening balance is the initial cost basis, not gain (see investmentService).
  const invested = account.startingBalance + contributions - redemptions;
  const current = account.balance;
  const gain = current - invested;
  const pct = returnPct(invested, gain);

  // Value over time — oldest first, running sum of each transaction's effect.
  const chronological = [...(txns ?? [])].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  // Seed at the opening balance so the value line reflects true worth over time, not just
  // the movement since zero.
  const line: number[] = [];
  let running = account.startingBalance;
  for (const t of chronological) { running += effectOn(t, id!); line.push(running); }

  const nameOf = (accId?: string | null) => (accId ? allAccounts.find((a) => a._id === accId)?.name : undefined);

  const historyRow = (t: ITransaction): HistoryRow => {
    const eff = effectOn(t, id!);
    if (t.type === "transfer" && t.toAccount === id) {
      return { icon: "add", tint: "success", soft: "successSoft", title: `Invested from ${nameOf(t.account) ?? "an account"}`, amt: `+${formatMoney(t.amount)}`, amtColor: "success" };
    }
    if (t.type === "transfer" && t.account === id) {
      return { icon: "transfer", tint: "info", soft: "infoSoft", title: `Redeemed to ${nameOf(t.toAccount) ?? "an account"}`, amt: `−${formatMoney(t.amount)}`, amtColor: "inkDim" };
    }
    const up = eff >= 0;
    return { icon: up ? "income" : "expenses", tint: up ? "success" : "danger", soft: up ? "successSoft" : "dangerSoft", title: "Value updated", amt: `${up ? "▲ " : "▼ "}${formatMoney(Math.abs(eff))}`, amtColor: gainColor(eff) };
  };

  return (
    <ScreenScaffold header={header}>
      <Card style={styles.card}>
        <AppText size="xs" weight="semibold" color="inkDim" style={styles.caps}>
          {account.investmentKind ?? "Investment"}
        </AppText>
        <Money value={current} weight="black" size="xl" />
        <AppText size="sm" weight="bold" color={gainColor(gain)} style={styles.delta}>
          {gain > 0 ? "▲ " : gain < 0 ? "▼ " : ""}{formatMoney(Math.abs(gain))}{pct !== null ? ` (${pct >= 0 ? "+" : ""}${Math.round(pct)}%)` : ""}
        </AppText>
        {line.length >= 2 && <Sparkline values={line} />}
      </Card>

      <Card style={styles.statCard}>
        <View style={styles.stat}><AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>Invested</AppText><Money value={invested} weight="black" size="sm" /></View>
        <View style={styles.statDivider} />
        <View style={styles.stat}><AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>Gain</AppText><AppText size="sm" weight="black" color={gainColor(gain)}>{formatMoney(gain)}</AppText></View>
        <View style={styles.statDivider} />
        <View style={styles.stat}><AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>Return</AppText><AppText size="sm" weight="black" color={gainColor(gain)}>{pct !== null ? `${pct >= 0 ? "+" : ""}${Math.round(pct)}%` : "—"}</AppText></View>
      </Card>

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

      {txns && txns.length > 0 && (
        <>
          <AppText size="xs" weight="bold" color="inkDim" style={styles.sectionLabel}>HISTORY</AppText>
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

      {error && <AppText size="sm" color="danger">{error}</AppText>}

      <RevalueSheet
        ref={revalueRef}
        holdings={[{ accountId: account._id, name: account.name, invested, current }]}
        onSaved={afterChange}
      />

      <EditAccountSheet ref={editRef} account={account} onSaved={afterChange} />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headTitle: { flex: 1 },
  card: { gap: spacing.sm },
  caps: { letterSpacing: 1, textTransform: "uppercase" },
  delta: { marginTop: 2 },
  statCard: { flexDirection: "row", alignItems: "center" },
  stat: { flex: 1, gap: 3 },
  statDivider: { width: 1, backgroundColor: colors.line, marginHorizontal: spacing.md, alignSelf: "stretch" },
  ctaRow: { flexDirection: "row", gap: spacing.md },
  ctaHalf: { flex: 1 },
  sectionLabel: { letterSpacing: 1.5, paddingHorizontal: 2 },
  hRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  hInfo: { flex: 1, gap: 2 },
});

export default InvestmentDetailScreen;
