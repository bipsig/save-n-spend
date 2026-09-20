import { StyleSheet, View } from "react-native";
import Card from "./Card";
import { AppText } from "../ui/AppText";
import Icon from "../ui/Icon";
import PressableScale from "../ui/PressableScale";
import { recurringBillsTotal, urgentBills } from "@/lib/bills";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import type { IBill } from "@save-n-spend/types";
import { spacing } from "@/theme";

type Props = {
  items: IBill[];
  onPress: () => void;
};

// Replaces the raw "next 3 upcoming bills" list — Bills already shows the complete list,
// so this states the two facts that list doesn't: how much is committed every period
// regardless of anything else, and whether anything actually needs acting on right now.
const BillsGlanceCard = ({ items, onPress }: Props) => {
  usePrivacyMask(); // subscribe: the amounts below read formatMoney() directly

  const recurring = recurringBillsTotal(items);
  const urgent = urgentBills(items);

  // Nothing recurring and nothing urgent — genuinely nothing to say (not "0 bills due",
  // which is filler). Bills' own empty state already owns "add your first bill".
  if (items.length === 0 || (recurring.total === 0 && urgent.count === 0)) return null;

  const label = [
    recurring.total > 0 ? `${formatMoney(recurring.total)} a month committed to bills` : null,
    urgent.count > 0 ? `${urgent.count} due soon, ${formatMoney(urgent.total)}` : null,
  ].filter(Boolean).join(". ") + ". Opens Bills.";

  return (
    <PressableScale onPress={onPress} scaleTo={0.98} accessibilityRole="button" accessibilityLabel={label}>
      <Card style={styles.card}>
        <View style={styles.topRow}>
          <Icon name="bills" size={20} containerSize={40} containerRadius={13} container="square" gradient="blue" />
          <View style={styles.col}>
            <AppText size="xs" weight="semibold" color="inkDim" style={styles.label}>
              BILLS
            </AppText>
            {recurring.total > 0 && (
              <AppText size="sm" weight="bold" numberOfLines={1}>
                {formatMoney(recurring.total)}
                <AppText size="xs" weight="semibold" color="inkDim"> /month</AppText>
                {" committed"}
              </AppText>
            )}
            {recurring.topNames.length > 0 && (
              <AppText size="xs" color="inkDim" numberOfLines={1}>
                {recurring.topNames.join(" · ")}
              </AppText>
            )}
          </View>
        </View>

        {urgent.count > 0 && (
          <View style={styles.nudge}>
            <Icon name="alarm" size={15} color="danger" />
            <AppText size="xs" weight="bold" color="danger" numberOfLines={1} style={styles.nudgeText}>
              {urgent.count} bill{urgent.count === 1 ? "" : "s"} due soon · {formatMoney(urgent.total)}
            </AppText>
          </View>
        )}
      </Card>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: 12,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  col: {
    flex: 1,
    gap: 2,
  },
  label: {
    letterSpacing: 1,
  },
  nudge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  nudgeText: {
    flex: 1,
  },
});

export default BillsGlanceCard;
