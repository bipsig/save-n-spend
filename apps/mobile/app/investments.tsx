import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import DonutChart from "@/components/charts/DonutChart";
import ChartLegend from "@/components/ui/ChartLegend";
import Money from "@/components/ui/Money";
import Icon from "@/components/ui/Icon";
import Button from "@/components/ui/Button";
import PressableScale from "@/components/ui/PressableScale";
import { AppText } from "@/components/ui/AppText";
import Caps from "@/components/ui/Caps";
import SegmentedControl from "@/components/ui/SegmentedControl";
import EmptyState from "@/components/states/EmptyState";
import ScreenStates from "@/components/states/ScreenStates";
import SkeletonState from "@/components/states/SkeletonState";
import EditAccountSheet from "@/components/sheets/EditAccountSheet";
import RevalueSheet from "@/components/sheets/RevalueSheet";
import InvestmentsExportSheet, { type InvestmentsExportHandle } from "@/components/sheets/InvestmentsExportSheet";
import TrendsView, { INVEST_TABS, type InvestTab } from "@/components/investments/TrendsView";
import { useInvestments, useInvestmentTrend, returnPct, formatAnnual, holdingLook } from "@/lib/investments";
import { useVisible } from "@/lib/undo";
import { useAccounts } from "@/lib/accounts";
import { useBills } from "@/lib/bills";
import { formatDueLabel } from "@/lib/date";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { formatPct, percentOf } from "@/lib/format/pct";
import { count } from "@/lib/format/count";
import { screenTitles } from "@/data/menu";
import type { InvestmentHolding } from "@save-n-spend/types";
import type { IconName } from "@/lib/icons";
import { chartPalette, chartOthers, colors, radius, spacing } from "@/theme";
import { chipTintFor } from "@/theme/gradients";
import { signTone } from "@/lib/signTone";
import { mergeScreenStates } from "@/lib/screenStates";

const gainColor = (n: number) => signTone(n);
const gainStr = (n: number) => formatMoney(n, { sign: "always" });
const returnStr = (pct: number | null) => (pct !== null ? formatPct(pct, { kind: "return" }) : null);

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
          <AppText size="xs" color="inkDim" numberOfLines={1}>Invested {formatMoney(h.invested)}</AppText>
          {/* Its own line — sharing one with "Invested ₹2,50,000" truncated it to "·…" on a phone. */}
          {h.annualReturnStatus === "ok" && h.annualReturn !== null && (
            <AppText size="xs" weight="bold" color={gainColor(h.annualReturn)} numberOfLines={1}>{formatAnnual(h.annualReturn)}</AppText>
          )}
        </View>
        <View style={styles.holdRight}>
          <Money value={h.current} weight="bold" size="sm" align="right" />
          <AppText size="xs" weight="bold" color={gainColor(h.gain)}>
            {[gainStr(h.gain), returnStr(pct)].filter(Boolean).join(" · ")}
          </AppText>
        </View>
      </View>
    </PressableScale>
  );
};

const InvestmentsScreen = () => {
  usePrivacyMask();
  const router = useRouter();
  const { revalue, tab: tabParam, export: exportParam } = useLocalSearchParams<{ revalue?: string; tab?: string; export?: string }>();
  const investments = useInvestments();
  const { data } = investments;
  const trendQuery = useInvestmentTrend();
  const trend = trendQuery.data;
  const [tab, setTab] = useState<InvestTab>("overview");
  const investmentAccounts = useAccounts().filter((a) => a.type === "investment");
  const billsQuery = useBills();
  const sipBills = billsQuery.items.filter((b) => b.toInvestment);

  // The hub draws once the portfolio is in; Trends and the SIP rows join when theirs are.
  // So a failed trend or bills read only ever shows as the refresh strip.
  const merged = mergeScreenStates(
    { ...investments, hasData: data !== null },
    { ...trendQuery, hasData: trend !== null },
    { ...billsQuery, hasData: billsQuery.data !== null },
  );
  const state = { ...merged, hasData: data !== null, error: data !== null ? merged.error : investments.error };

  const newRef = useRef<BottomSheetModal>(null);
  const revalueRef = useRef<BottomSheetModal>(null);
  const exportRef = useRef<InvestmentsExportHandle>(null);

  // Arriving from the monthly reminder ("your investment values are due") opens the
  // revalue sheet straight away. Guarded so it only fires once per arrival.
  const [autoRevalued, setAutoRevalued] = useState(false);
  useEffect(() => {
    if (revalue === "1" && !autoRevalued && investmentAccounts.length > 0) {
      setAutoRevalued(true);
      revalueRef.current?.present();
    }
  }, [revalue, autoRevalued, investmentAccounts.length]);

  // A What's new link can open Trends or the export. Each opens once, when there's
  // something to show, and the param is cleared so coming back doesn't open it again.
  useEffect(() => {
    if (tabParam !== "trends" || !trend) return;
    if (trend.points.length > 0) setTab("trends");
    router.setParams({ tab: undefined });
  }, [tabParam, trend, router]);

  useEffect(() => {
    if (exportParam !== "1" || !data) return;
    if (data.holdings.length > 0) exportRef.current?.present();
    router.setParams({ export: undefined });
  }, [exportParam, data, router]);

  const holdings = useVisible("investment", data?.holdings ?? [], (h) => h.accountId);
  // Holdings whose opening amount has no date — the yearly return can't be worked out.
  const undated = holdings.filter((h) => h.annualReturnStatus === "noStartDate");
  // Strongest holding. Ranked by yearly return when at least two holdings have one — all-time
  // % favours whatever has been held longest (+20% over five years beats +6% in three months).
  // Otherwise simple return, the only figure every holding has. Never a mix of the two.
  const yearly = holdings.filter((h) => h.annualReturnStatus === "ok" && h.annualReturn !== null);
  const byYear = yearly.length >= 2;
  const best = (byYear
    ? yearly.map((h) => ({ h, value: (h.annualReturn as number) * 100 }))
    : holdings.map((h) => ({ h, value: returnPct(h.invested, h.gain) })))
    .filter((x): x is { h: InvestmentHolding; value: number } => x.value !== null && x.value > 0)
    .sort((a, b) => b.value - a.value)[0];
  const bestLook = holdingLook(best?.h);

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
    <ScreenScaffold
      title={screenTitles.investments}
      back
      actions={[
        ...(holdings.length > 0 ? [{ kind: "export" as const, label: "Export investments", onPress: () => exportRef.current?.present() }] : []),
        { kind: "new", label: "New investment", onPress: () => newRef.current?.present() },
      ]}
      states={state}
    >
      <ScreenStates
        state={state}
        skeleton={
          <View style={{ gap: spacing.md }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonState key={i} height={80} borderRadius={radius.lg} />
            ))}
          </View>
        }
      >
      {data && holdings.length === 0 && (
        <EmptyState
          icon="investments"
          title="No investments yet"
          subtitle="Track your SIPs, mutual funds, FDs and more — money you've invested, kept out of your spending."
          actionLabel="Add investment"
          onAction={() => newRef.current?.present()}
        />
      )}

      {data && holdings.length > 0 && trend && trend.points.length > 0 && (
        <SegmentedControl size="sm" accessibilityLabel="View" segments={INVEST_TABS} value={tab} onChange={setTab} />
      )}

      {data && holdings.length > 0 && tab === "trends" && trend && trend.points.length > 0 && (
        <TrendsView trend={trend} />
      )}

      {data && holdings.length > 0 && tab === "overview" && (
        <>
          <Card style={styles.card}>
            <Caps>Total value</Caps>
            <Money value={data.totals.current} weight="black" size="xl" />
            {(() => {
              const pct = returnPct(data.totals.invested, data.totals.gain);
              return (
                <AppText size="sm" weight="bold" color={gainColor(data.totals.gain)} style={styles.heroDelta}>
                  {gainStr(data.totals.gain)}{pct !== null ? ` (${returnStr(pct)})` : ""} all time
                </AppText>
              );
            })()}
            {data.totals.annualReturnStatus === "ok" && data.totals.annualReturn !== null && (
              <AppText size="xs" weight="bold" color={gainColor(data.totals.annualReturn)}>
                {formatAnnual(data.totals.annualReturn)} across your portfolio
              </AppText>
            )}
            <View style={styles.split}>
              <View style={styles.splitCell}><Caps>Invested</Caps><Money value={data.totals.invested} weight="black" size="sm" /></View>
              <View style={styles.splitDivider} />
              <View style={styles.splitCell}><Caps>Current</Caps><Money value={data.totals.current} weight="black" size="sm" /></View>
            </View>
          </Card>

          {undated.length > 0 && (
            <PressableScale
              onPress={() => router.push({ pathname: "/investment-detail", params: { id: undated[0].accountId, edit: "1" } })}
              scaleTo={0.98}
              accessibilityRole="button"
            >
              <Card style={styles.perfCard}>
                <Icon name="date" size={16} containerSize={38} containerRadius={12} container="square" gradient="blue" />
                <View style={styles.holdInfo}>
                  <AppText size="sm" weight="bold" numberOfLines={1}>
                    {undated.length === 1 ? `Add when ${undated[0].name} started` : `Add start dates to ${count(undated.length, "holding")}`}
                  </AppText>
                  <AppText size="xs" color="inkDim">To see yearly returns</AppText>
                </View>
                <Icon name="chevronRight" size={20} color="inkDim" />
              </Card>
            </PressableScale>
          )}

          {donutSlices.length > 1 && (
            <Card style={styles.card}>
              <Caps>Allocation</Caps>
              <View style={styles.allocRow}>
                <DonutChart
                  data={donutSlices}
                  centerLabel="Total"
                  centerValue={data.totals.current}
                  size={150}
                  thickness={22}
                  summaryTitle="Allocation"
                />
                <ChartLegend
                  layout="column"
                  style={styles.legend}
                  items={donutSlices.map((s) => ({ label: s.name, color: s.color, value: formatPct(s.pct) }))}
                />
              </View>
            </Card>
          )}

          <Card style={styles.card}>
            <View style={styles.split}>
              <View style={styles.splitCell}>
                <Caps>Invested this month</Caps>
                <Money value={data.thisMonth.contributed} weight="black" size="sm" />
              </View>
              <View style={styles.splitDivider} />
              <View style={styles.splitCell}>
                <Caps>Portfolio this month</Caps>
                <AppText size="sm" weight="black" color={gainColor(data.thisMonth.portfolioChange)}>
                  {gainStr(data.thisMonth.portfolioChange)}
                </AppText>
              </View>
            </View>
            {data.thisMonth.income > 0 && data.thisMonth.contributed > 0 && (
              <AppText size="xs" color="inkDim" style={styles.rateNote}>
                You invested {formatPct(percentOf(data.thisMonth.contributed, data.thisMonth.income))} of the {formatMoney(data.thisMonth.income)} income you logged this month.
              </AppText>
            )}
          </Card>

          {best && (
            <PressableScale
              onPress={() => router.push({ pathname: "/investment-detail", params: { id: best.h.accountId } })}
              scaleTo={0.98}
              accessibilityRole="button"
            >
              <Card style={styles.perfCard}>
                <Icon name={bestLook.icon} size={16} containerSize={38} containerRadius={12} container="square" gradient={bestLook.tint} />
                <View style={styles.holdInfo}>
                  <AppText size="sm" weight="bold" numberOfLines={1}>{best.h.name}</AppText>
                  <AppText size="xs" color="inkDim">{byYear ? "Your strongest holding, per year" : "Your strongest holding"}</AppText>
                </View>
                <AppText size="sm" weight="black" color="success">
                  {byYear ? `${returnStr(best.value)} a year` : returnStr(best.value)}
                </AppText>
              </Card>
            </PressableScale>
          )}

          {data.allocation.map((group) => {
            const rows = holdings.filter((h) => h.kind === group.kind);
            const subtotal = rows.reduce((s, h) => s + h.current, 0);
            const gain = rows.reduce((s, h) => s + h.gain, 0);
            return (
              <View key={group.kind}>
                <View style={styles.groupHead}>
                  <Caps style={styles.groupLabel}>{group.kind}</Caps>
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
                <Caps style={styles.groupLabel}>Recurring</Caps>
                <AppText size="xs" weight="bold" color="inkDim">SIPs</AppText>
              </View>
              <Card style={styles.card}>
                {sipBills.map((b) => {
                  const look = holdingLook(holdings.find((h) => h.accountId === b.toInvestment));
                  return (
                  <PressableScale key={b._id} onPress={() => router.push("/bills")} scaleTo={0.98}>
                    <View style={styles.holdRow}>
                      <Icon name={look.icon} size={16} containerSize={38} containerRadius={12} container="square" gradient={look.tint} />
                      <View style={styles.holdInfo}>
                        <AppText size="sm" weight="bold" numberOfLines={1}>{b.name}</AppText>
                        <AppText size="xs" color="inkDim">
                          {[formatDueLabel(b.dueDate, b.status, b.lastPaidAt), b.frequency].filter(Boolean).join(" · ")}
                        </AppText>
                      </View>
                      <Money value={b.amount} weight="bold" size="sm" align="right" />
                    </View>
                  </PressableScale>
                  );
                })}
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
      </ScreenStates>

      <EditAccountSheet ref={newRef} account={null} defaultType="investment" />
      <InvestmentsExportSheet ref={exportRef} />
      <RevalueSheet ref={revalueRef} holdings={holdings} />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  rateNote: { marginTop: spacing.xs, lineHeight: 17 },
  heroDelta: { marginTop: 2 },
  split: { flexDirection: "row", marginTop: spacing.xs },
  splitCell: { flex: 1, gap: 3 },
  splitDivider: { width: 1, backgroundColor: colors.line, marginHorizontal: spacing.md },
  allocRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  legend: { flex: 1 },
  perfCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  groupHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: spacing.sm },
  groupLabel: { paddingHorizontal: 2 },
  holdRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  holdInfo: { flex: 1, gap: 2 },
  holdRight: { alignItems: "flex-end", gap: 2 },
  ctaRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs },
  ctaHalf: { flex: 1 },
});

export default InvestmentsScreen;
