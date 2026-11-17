import { useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { CashFlowDay, CashFlowItem } from "@save-n-spend/types";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import CashFlowMonthGrid, { KIND_COLOR } from "@/components/charts/CashFlowMonthGrid";
import ConfirmSheet from "@/components/sheets/ConfirmSheet";
import Money from "@/components/ui/Money";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import { AppText } from "@/components/ui/AppText";
import Caps from "@/components/ui/Caps";
import ChartLegend from "@/components/ui/ChartLegend";
import EmptyState from "@/components/states/EmptyState";
import ScreenStates from "@/components/states/ScreenStates";
import SkeletonState from "@/components/states/SkeletonState";
import { useCashFlow } from "@/lib/cashFlow";
import { dismissRecurring } from "@/lib/recurring";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { formatCalendar, MONTHS_LONG } from "@/lib/format/date";
import { screenTitles } from "@/data/menu";
import { toast } from "@/store/toast";
import type { IconName } from "@/lib/icons";
import { radius, spacing } from "@/theme";

const ICON: Record<CashFlowItem["kind"], IconName> = { bill: "bills", sip: "investments", income: "income" };

const monthTitle = (month: string): string => (month ? formatCalendar(month, "monthLong") : "");
const monthName = (month: string): string => (month ? MONTHS_LONG[Number(month.slice(5, 7)) - 1] : "");
// Projection days are calendar keys, so they are never shifted by a zone: "Sat, 21 Nov".
const dayLabel = (key: string): string => formatCalendar(key, "weekday");

const ItemRow = ({ item, onPress }: { item: CashFlowItem; onPress: () => void }) => {
  const incoming = item.kind === "income";
  const meta = item.kind === "income"
    ? `Expected · based on the last ${item.basedOnMonths} months`
    : item.overdue ? "Overdue — still to pay" : item.kind === "sip" ? "SIP" : "Bill";
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} style={styles.item}>
      <View style={[styles.itemBar, { backgroundColor: KIND_COLOR[item.kind] }]} />
      <Icon name={ICON[item.kind]} size={16} color="inkDim" />
      <View style={styles.itemText}>
        <AppText size="sm" weight="bold" numberOfLines={1}>{item.name}</AppText>
        <AppText size="xs" color={item.overdue ? "danger" : "inkDim"} numberOfLines={1}>{meta}</AppText>
      </View>
      <Money value={incoming ? item.amount : -item.amount} sign="always" size="sm" weight="black" color={incoming ? "success" : "ink"} align="right" />
    </PressableScale>
  );
};

// What's coming in and going out between now and the end of next month, and what that
// leaves in the bank each day. Bills and SIPs land on their due dates, income on the day it
// usually arrives, and typical everyday spending is taken off every day in between — so the
// lowest point is a realistic one, not just "after rent".
const CashFlowScreen = () => {
  usePrivacyMask();
  const router = useRouter();
  const cashFlow = useCashFlow();
  const { data, refetch } = cashFlow;
  const state = { ...cashFlow, hasData: data !== null };

  const byDate = useMemo(() => new Map((data?.days ?? []).map((d) => [d.date, d])), [data]);
  const todayKey = data?.days[0]?.date ?? "";
  const months = useMemo(() => [...new Set((data?.days ?? []).map((d) => d.date.slice(0, 7)))], [data]);
  const [monthIndex, setMonthIndex] = useState(0);
  const month = months[Math.min(monthIndex, Math.max(months.length - 1, 0))] ?? "";

  // Default selection: the next day with anything on it, else today.
  const firstBusy = data?.days.find((d) => d.items.length > 0)?.date ?? todayKey;
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked && byDate.has(picked) ? picked : firstBusy;
  const selectedDay = byDate.get(selected);

  const agenda = (data?.days ?? []).filter((d) => d.date.startsWith(month) && d.items.length > 0);

  const incomeRef = useRef<BottomSheetModal>(null);
  const [incomeItem, setIncomeItem] = useState<CashFlowItem | null>(null);

  // Paging months moves the selection with it — to that month's first busy day, else its
  // first projected day — so the detail card never describes a month you've scrolled away from.
  const goToMonth = (index: number) => {
    const target = months[index];
    if (!target) return;
    setMonthIndex(index);
    const inMonth = (data?.days ?? []).filter((d) => d.date.startsWith(target));
    setPicked((inMonth.find((d) => d.items.length > 0) ?? inMonth[0])?.date ?? null);
  };

  const openItem = (item: CashFlowItem) => {
    if (item.kind === "income") {
      setIncomeItem(item);
      incomeRef.current?.present();
    }
    else {
      router.push("/bills");
    }
  };

  const nothingScheduled = !!data && data.days.every((d) => d.items.length === 0);

  return (
    <ScreenScaffold title={screenTitles.cashFlow} back states={state}>
      <ScreenStates
        state={state}
        skeleton={
          <View style={styles.stack}>
            <SkeletonState height={130} borderRadius={radius.lg} />
            <SkeletonState height={320} borderRadius={radius.lg} />
          </View>
        }
      >
        {() => data && (
        <>
          <Card style={styles.card}>
            <Caps>In your accounts today</Caps>
            <Money value={data.startBalance} size="xl" weight="black" />
            <View style={styles.split}>
              <View style={styles.splitCell}>
                <Caps>Lowest</Caps>
                <Money value={data.lowest.balance} size="sm" weight="black" color={data.lowest.balance < 0 ? "danger" : "ink"} />
                <AppText size="xs" color="inkDim">{dayLabel(data.lowest.date)}</AppText>
              </View>
              <View style={styles.splitDivider} />
              <View style={styles.splitCell}>
                <Caps>{`End of ${monthName(months[months.length - 1] ?? month)}`}</Caps>
                <Money value={data.endBalance} size="sm" weight="black" color={data.endBalance < 0 ? "danger" : "ink"} />
              </View>
            </View>
            {data.lowest.balance < 0 && (
              <AppText size="xs" weight="semibold" color="danger">
                At this pace you'd run short around {dayLabel(data.lowest.date)}.
              </AppText>
            )}
            <AppText size="xs" color="inkDim">
              {data.dailySpend > 0
                ? `Bank, cash and wallets only. Includes about ${formatMoney(data.dailySpend)} a day of everyday spending.`
                : "Bank, cash and wallets only."}
            </AppText>
          </Card>

          {nothingScheduled && (
            <EmptyState
              icon="date"
              title="Nothing scheduled yet"
              subtitle="Add your bills and SIPs, and income that arrives monthly will show up here on its own."
              actionLabel="Go to bills"
              onAction={() => router.push("/bills")}
            />
          )}

          <Card style={styles.card}>
            <View style={styles.monthBar}>
              <PressableScale
                onPress={() => goToMonth(Math.max(0, monthIndex - 1))}
                disabled={monthIndex === 0}
                scaleTo={0.9}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Previous month"
              >
                <Icon name="chevronLeft" size={22} color={monthIndex === 0 ? "inkDim" : "ink"} />
              </PressableScale>
              <AppText size="md" weight="black">{monthTitle(month)}</AppText>
              <PressableScale
                onPress={() => goToMonth(Math.min(months.length - 1, monthIndex + 1))}
                disabled={monthIndex >= months.length - 1}
                scaleTo={0.9}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Next month"
              >
                <Icon name="chevronRight" size={22} color={monthIndex >= months.length - 1 ? "inkDim" : "ink"} />
              </PressableScale>
            </View>

            <CashFlowMonthGrid month={month} days={byDate} todayKey={todayKey} selected={selected} onSelect={setPicked} />

            <ChartLegend
              style={styles.legend}
              items={(["bill", "sip", "income"] as const).map((k) => ({ label: k === "bill" ? "Bill" : k === "sip" ? "SIP" : "Income", color: KIND_COLOR[k] }))}
            />
          </Card>

          {selectedDay && <DayCard day={selectedDay} isToday={selected === todayKey} dailySpend={data.dailySpend} onItem={openItem} />}

          {agenda.length > 0 && (
            <View style={styles.stack}>
              <Caps header>{`Coming up in ${monthName(month)}`}</Caps>
              {agenda.map((d) => (
                <PressableScale key={d.date} onPress={() => setPicked(d.date)} scaleTo={0.98} accessibilityState={{ selected: d.date === selected }}>
                  <Card style={[styles.agendaDay, d.date === selected && styles.agendaSelected]}>
                    <View style={styles.agendaHead}>
                      <Caps>{d.date === todayKey ? "Today" : dayLabel(d.date)}</Caps>
                      <Money value={d.balance} size="xs" weight="bold" color={d.balance < 0 ? "danger" : "inkDim"} align="right" />
                    </View>
                    {d.items.map((it, i) => <ItemRow key={i} item={it} onPress={() => openItem(it)} />)}
                  </Card>
                </PressableScale>
              ))}
            </View>
          )}
        </>
        )}
      </ScreenStates>

      <ConfirmSheet
        ref={incomeRef}
        icon="income"
        tone="primary"
        title={`Not a regular income?`}
        body={`${incomeItem?.name ?? "This"} has come in about once a month, so it's expected here. If it won't keep coming, hide it and it'll stop being counted.`}
        confirmLabel="Hide it"
        needsConnection
        cancelLabel="Keep it"
        onConfirm={async () => {
          if (!incomeItem?.patternKey) return;
          await dismissRecurring(incomeItem.patternKey);
          toast.info(`${incomeItem.name} won't be expected anymore`);
          // A dismissal only refreshes the recurring reads (lib/query/invalidate.ts), and
          // the projection is built from those patterns.
          await refetch();
        }}
      />
    </ScreenScaffold>
  );
};

const DayCard = ({ day, isToday, dailySpend, onItem }: {
  day: CashFlowDay;
  isToday: boolean;
  dailySpend: number;
  onItem: (item: CashFlowItem) => void;
}) => (
  <Card style={styles.card}>
    <View style={styles.agendaHead}>
      <AppText size="sm" weight="black">{isToday ? "Today" : dayLabel(day.date)}</AppText>
      <View style={styles.dayBalance}>
        <AppText size="xs" color="inkDim">Projected</AppText>
        <Money value={day.balance} size="sm" weight="black" color={day.balance < 0 ? "danger" : "ink"} align="right" />
      </View>
    </View>
    {day.items.length > 0
      ? day.items.map((it, i) => <ItemRow key={i} item={it} onPress={() => onItem(it)} />)
      : (
        <AppText size="xs" color="inkDim">
          {isToday || dailySpend === 0
            ? "Nothing scheduled."
            : `Nothing scheduled — just about ${formatMoney(dailySpend)} of everyday spending.`}
        </AppText>
      )}
  </Card>
);

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  card: { gap: spacing.sm },
  split: { flexDirection: "row", marginTop: spacing.xs },
  splitCell: { flex: 1, gap: 2 },
  splitDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.08)", marginHorizontal: spacing.md },
  monthBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: spacing.xs },
  legend: { justifyContent: "center", paddingTop: spacing.xs },
  agendaDay: { gap: spacing.sm },
  agendaSelected: { borderColor: "rgba(155,140,255,0.55)" },
  agendaHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dayBalance: { alignItems: "flex-end" },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 4 },
  itemBar: { width: 3, alignSelf: "stretch", borderRadius: 2 },
  itemText: { flex: 1, gap: 1 },
});

export default CashFlowScreen;
