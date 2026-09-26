import { StyleSheet, View } from "react-native";
import type { CashFlowPayload } from "@save-n-spend/types";
import Card from "./Card";
import { AppText } from "../ui/AppText";
import Icon from "../ui/Icon";
import Money from "../ui/Money";
import PressableScale from "../ui/PressableScale";
import { dayLabel } from "@/lib/cashFlow";
import formatMoney, { usePrivacyMask } from "@/lib/money";

/** How far ahead the dashboard looks — the calendar itself goes to the end of next month. */
const GLANCE_DAYS = 30;

type Props = {
  data: CashFlowPayload;
  onPress: () => void;
};

// The one number the cash-flow calendar exists for — how low the bank gets before money
// comes back in — plus what's next. Opens the calendar for the rest.
const CashFlowGlanceCard = ({ data, onPress }: Props) => {
  usePrivacyMask();
  const window = data.days.slice(0, GLANCE_DAYS + 1);
  // Nothing scheduled at all: the calendar's own empty state covers it; nothing to say here.
  const next = window.flatMap((d) => d.items.map((it) => ({ date: d.date, item: it })))[0];
  if (!next) return null;

  const lowest = window.reduce((low, d) => (d.balance < low.balance ? d : low), window[0]);
  const short = lowest.balance < 0;
  const label = `Next 30 days. Lowest ${short ? "minus " : ""}${formatMoney(Math.abs(lowest.balance))} on ${dayLabel(lowest.date)}. Next: ${next.item.name}. Opens cash flow.`;

  return (
    <PressableScale onPress={onPress} scaleTo={0.98} accessibilityRole="button" accessibilityLabel={label}>
      <Card style={styles.card}>
        <View style={styles.top}>
          <Icon name="date" size={20} containerSize={40} containerRadius={13} container="square" gradient={short ? "red" : "teal"} />
          <View style={styles.col}>
            <AppText size="xs" weight="semibold" color="inkDim" style={styles.caps}>NEXT 30 DAYS</AppText>
            <View style={styles.line}>
              <AppText size="sm" weight="bold">Lowest </AppText>
              <Money value={Math.abs(lowest.balance)} prefix={short ? "− " : ""} size="sm" weight="black" color={short ? "danger" : "ink"} />
              <AppText size="sm" weight="bold" color="inkDim"> · {dayLabel(lowest.date)}</AppText>
            </View>
            <AppText size="xs" color="inkDim" numberOfLines={1}>
              Next: {next.item.name} · {dayLabel(next.date)}
            </AppText>
          </View>
          <Icon name="chevronRight" size={20} color="inkDim" />
        </View>
      </Card>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  card: { gap: 12 },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  col: { flex: 1, gap: 2 },
  line: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap" },
  caps: { letterSpacing: 1 },
});

export default CashFlowGlanceCard;
