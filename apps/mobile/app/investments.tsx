import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import BackButton from "@/components/shell/BackButton";
import Card from "@/components/data/Card";
import DonutChart from "@/components/charts/DonutChart";
import Money from "@/components/ui/Money";
import Icon from "@/components/ui/Icon";
import Button from "@/components/ui/Button";
import PressableScale from "@/components/ui/PressableScale";
import { AppText } from "@/components/ui/AppText";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import SkeletonState from "@/components/states/SkeletonState";
import EditAccountSheet from "@/components/sheets/EditAccountSheet";
import RevalueSheet from "@/components/sheets/RevalueSheet";
import { useInvestments, returnPct } from "@/lib/investments";
import { useAccounts } from "@/lib/accounts";
import { useBills } from "@/lib/bills";
import { formatDueLabel } from "@/lib/date";
import { useAccountStore } from "@/store/accounts";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import type { InvestmentHolding } from "@save-n-spend/types";
import type { IconName } from "@/lib/icons";
import { chartPalette, chartOthers, colors, radius, spacing } from "@/theme";
import { chipTintFor } from "@/theme/gradients";

const GroupLabel = ({ children }: { children: string }) => (
  <AppText size="xs" weight="bold" color="inkDim" style={styles.groupLabel}>
    {children}
  </AppText>
);

const gainColor = (n: number) => (n > 0 ? "success" : n < 0 ? "danger" : "inkDim");
const gainStr = (n: number) => `${n > 0 ? "▲ " : n < 0 ? "▼ " : ""}${formatMoney(Math.abs(n))}`;

const HoldingRow = ({ h, onPress }: { h: InvestmentHolding; onPress: () => void }) => {
  const pct = returnPct(h.invested, h.gain);
  return (
    <PressableScale onPress={onPress} scaleTo={0.98}>
      <View style={styles.holdRow}>
        <Icon
          name={(h.icon ?? "investments") as IconName}
          size={16}
          containerSize={38}
          containerRadius={12}
          container="square"
          gradient={chipTintFor(h.color)}
        />
        <View style={styles.holdInfo}>
          <AppText size="sm" weight="bold" numberOfLines={1}>{h.name}</AppText>
          <AppText size="xs" color="inkDim">Invested {formatMoney(h.invested)}</AppText>
        </View>
        <View style={styles.holdRight}>
          <Money value={h.current} weight="bold" size="sm" align="right" />
          <AppText size="xs" weight="bold" color={gainColor(h.gain)}>
            {gainStr(h.gain)}{pct !== null ? ` · ${pct >= 0 ? "+" : ""}${Math.round(pct)}%` : ""}
          </AppText>
        </View>
      </View>
    </PressableScale>
  );
};

const InvestmentsScreen = () => {
  usePrivacyMask();
  const router = useRouter();
  const { revalue } = useLocalSearchParams<{ revalue?: string }>();
  const { data, loading, error, refetch } = useInvestments();
  const investmentAccounts = useAccounts().filter((a) => a.type === "investment");
  const { items: bills, refetch: refetchBills } = useBills();
  const sipBills = bills.filter((b) => b.toInvestment);

  const newRef = useRef<BottomSheetModal>(null);
  const revalueRef = useRef<BottomSheetModal>(null);

  useFocusEffect(useCallback(() => { void refetch(); void refetchBills(); }, [refetch, refetchBills]));

  // Arriving from the monthly reminder ("your investment values are due") opens the
  // revalue sheet straight away. Guarded so it only fires once per arrival.
  const [autoRevalued, setAutoRevalued] = useState(false);
  useEffect(() => {
    if (revalue === "1" && !autoRevalued && investmentAccounts.length > 0) {
      setAutoRevalued(true);
      revalueRef.current?.present();
    }
  }, [revalue, autoRevalued, investmentAccounts.length]);

  const afterChange = () => {
    void refetch();
    void useAccountStore.getState().load();
  };

  const header = (
    <View style={styles.head}>
      <BackButton />
      <AppText size="xl" weight="black" style={styles.headTitle}>Investments</AppText>
      <PressableScale onPress={() => newRef.current?.present()} scaleTo={0.94} hitSlop={8}>
        <View style={styles.newBtn}>
          <Icon name="add" size={15} color="ink" />
          <AppText size="xs" weight="bold">New</AppText>
        </View>
      </PressableScale>
    </View>
  );

  const holdings = data?.holdings ?? [];
  // Best performer: the holding with the strongest positive simple return.
  const best = holdings
    .map((h) => ({ h, pct: returnPct(h.invested, h.gain) }))
    .filter((x) => x.pct !== null && x.pct > 0)
    .sort((a, b) => (b.pct as number) - (a.pct as number))[0];

  // Allocation donut: by kind when there's more than one kind, otherwise by holding — so a
  // portfolio that's all one kind (e.g. two SIPs, both Mutual Fund) still gets a useful
  // split rather than a pointless single 100% ring.
  const donutSource = (data && data.allocation.length > 1)
    ? data.allocation.map((a) => ({ label: a.kind, value: a.current }))
    : holdings.map((h) => ({ label: h.name, value: h.current }));
  const donutTotal = donutSource.reduce((s, d) => s + d.value, 0);
  const donutSlices = donutSource
    .filter((d) => d.value > 0)
    .map((d, i) => ({ id: d.label, name: d.label, total: d.value, pct: donutTotal > 0 ? (d.value / donutTotal) * 100 : 0, color: i < chartPalette.length ? chartPalette[i] : chartOthers }));

  return (
    <ScreenScaffold header={header}>
      {error && <ErrorState message={error} onRetry={refetch} />}

      {!error && loading && !data && (
        <View style={{ gap: spacing.md }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonState key={i} height={80} borderRadius={radius.lg} />
          ))}
        </View>
      )}

      {!error && data && holdings.length === 0 && (
        <EmptyState
          icon="investments"
          title="No investments yet"
          subtitle="Track your SIPs, mutual funds, FDs and more — money you've invested, kept out of your spending."
          actionLabel="Add investment"
          onAction={() => newRef.current?.present()}
        />
      )}

      {!error && data && holdings.length > 0 && (
        <>
          <Card style={styles.card}>
            <AppText size="xs" weight="semibold" color="inkDim" style={styles.caps}>TOTAL VALUE</AppText>
            <Money value={data.totals.current} weight="black" size="xl" />
            {(() => {
              const pct = returnPct(data.totals.invested, data.totals.gain);
              return (
                <AppText size="sm" weight="bold" color={gainColor(data.totals.gain)} style={styles.heroDelta}>
                  {gainStr(data.totals.gain)}{pct !== null ? ` (${pct >= 0 ? "+" : ""}${Math.round(pct)}%)` : ""} all time
                </AppText>
              );
            })()}
            <View style={styles.split}>
              <View style={styles.splitCell}><AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>Invested</AppText><Money value={data.totals.invested} weight="black" size="sm" /></View>
              <View style={styles.splitDivider} />
              <View style={styles.splitCell}><AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>Current</AppText><Money value={data.totals.current} weight="black" size="sm" /></View>
            </View>
          </Card>

          {donutSlices.length > 1 && (
            <Card style={styles.card}>
              <AppText size="xs" weight="semibold" color="inkDim" style={styles.caps}>ALLOCATION</AppText>
              <View style={styles.allocRow}>
                <DonutChart
                  data={donutSlices}
                  centerLabel="Total"
                  centerValue={data.totals.current}
                  size={150}
                  thickness={22}
                />
                <View style={styles.legend}>
                  {donutSlices.map((s) => (
                    <View key={s.id} style={styles.legendRow}>
                      <View style={[styles.swatch, { backgroundColor: s.color }]} />
                      <AppText size="sm" weight="semibold" numberOfLines={1} style={styles.legendName}>{s.name}</AppText>
                      <AppText size="xs" weight="bold" color="inkDim">{Math.round(s.pct)}%</AppText>
                    </View>
                  ))}
                </View>
              </View>
            </Card>
          )}

          <Card style={styles.card}>
            <View style={styles.split}>
              <View style={styles.splitCell}>
                <AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>Invested this month</AppText>
                <Money value={data.thisMonth.contributed} weight="black" size="sm" />
              </View>
              <View style={styles.splitDivider} />
              <View style={styles.splitCell}>
                <AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>Portfolio this month</AppText>
                <AppText size="sm" weight="black" color={gainColor(data.thisMonth.portfolioChange)}>
                  {gainStr(data.thisMonth.portfolioChange)}
                </AppText>
              </View>
            </View>
            {data.thisMonth.income > 0 && data.thisMonth.contributed > 0 && (
              <AppText size="xs" color="inkDim" style={styles.rateNote}>
                You invested {Math.round((data.thisMonth.contributed / data.thisMonth.income) * 100)}% of the {formatMoney(data.thisMonth.income)} income you logged this month.
              </AppText>
            )}
          </Card>

          {best && (
            <Card style={styles.perfCard}>
              <Icon name="investments" size={16} containerSize={38} containerRadius={12} container="square" gradient="amber" />
              <View style={styles.holdInfo}>
                <AppText size="sm" weight="bold" numberOfLines={1}>{best.h.name}</AppText>
                <AppText size="xs" color="inkDim">Your strongest holding</AppText>
              </View>
              <AppText size="sm" weight="black" color="success">+{Math.round(best.pct as number)}%</AppText>
            </Card>
          )}

          {data.allocation.map((group) => {
            const rows = holdings.filter((h) => h.kind === group.kind);
            const subtotal = rows.reduce((s, h) => s + h.current, 0);
            const gain = rows.reduce((s, h) => s + h.gain, 0);
            return (
              <View key={group.kind}>
                <View style={styles.groupHead}>
                  <GroupLabel>{group.kind}</GroupLabel>
                  <AppText size="xs" weight="bold" color={gain !== 0 ? gainColor(gain) : "inkDim"}>
                    {formatMoney(subtotal)}{gain !== 0 ? ` · ${gainStr(gain)}` : ""}
                  </AppText>
                </View>
                <Card style={styles.card}>
                  {rows.map((h) => (
                    <HoldingRow
                      key={h.accountId}
                      h={h}
                      onPress={() => router.push({ pathname: "/investment-detail", params: { id: h.accountId } })}
                    />
                  ))}
                </Card>
              </View>
            );
          })}

          {sipBills.length > 0 && (
            <View>
              <View style={styles.groupHead}>
                <GroupLabel>Recurring</GroupLabel>
                <AppText size="xs" weight="bold" color="inkDim">SIPs</AppText>
              </View>
              <Card style={styles.card}>
                {sipBills.map((b) => (
                  <PressableScale key={b._id} onPress={() => router.push("/bills")} scaleTo={0.98}>
                    <View style={styles.holdRow}>
                      <Icon name="investments" size={16} containerSize={38} containerRadius={12} container="square" gradient="teal" />
                      <View style={styles.holdInfo}>
                        <AppText size="sm" weight="bold" numberOfLines={1}>{b.name}</AppText>
                        <AppText size="xs" color="inkDim">
                          {[formatDueLabel(b.dueDate, b.status, b.lastPaidAt), b.frequency].filter(Boolean).join(" · ")}
                        </AppText>
                      </View>
                      <Money value={b.amount} weight="bold" size="sm" align="right" />
                    </View>
                  </PressableScale>
                ))}
              </Card>
            </View>
          )}

          <View style={styles.ctaRow}>
            <View style={styles.ctaHalf}>
              <Button label="Update values" variant="secondary" onPress={() => revalueRef.current?.present()} />
            </View>
            <View style={styles.ctaHalf}>
              <Button label="Invest" icon="add" onPress={() => router.push({ pathname: "/add-transaction", params: { mode: "invest" } })} />
            </View>
          </View>
        </>
      )}

      <EditAccountSheet ref={newRef} account={null} defaultType="investment" onSaved={afterChange} />
      <RevalueSheet ref={revalueRef} holdings={holdings} onSaved={afterChange} />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headTitle: { flex: 1 },
  newBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    height: 34, paddingHorizontal: 12, borderRadius: radius.full,
    backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder,
  },
  card: { gap: spacing.sm },
  caps: { letterSpacing: 1, textTransform: "uppercase" },
  rateNote: { marginTop: spacing.xs, lineHeight: 17 },
  heroDelta: { marginTop: 2 },
  split: { flexDirection: "row", marginTop: spacing.xs },
  splitCell: { flex: 1, gap: 3 },
  splitDivider: { width: 1, backgroundColor: colors.line, marginHorizontal: spacing.md },
  allocRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  legend: { flex: 1, gap: 8 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendName: { flex: 1 },
  perfCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  groupHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: spacing.sm },
  groupLabel: { letterSpacing: 1, paddingHorizontal: 2 },
  holdRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  holdInfo: { flex: 1, gap: 2 },
  holdRight: { alignItems: "flex-end", gap: 2 },
  ctaRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs },
  ctaHalf: { flex: 1 },
});

export default InvestmentsScreen;
