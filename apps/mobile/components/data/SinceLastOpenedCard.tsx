import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Card from "./Card";
import { AppText } from "../ui/AppText";
import Icon from "../ui/Icon";
import PressableScale from "../ui/PressableScale";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { count } from "@/lib/format/count";
import { relativeTime } from "@/lib/format/date";
import { sinceCopy } from "@/lib/sinceLastOpened";

type Props = {
  previousOpenedAt: string;
  transactions: number;
  /** Spending, each closed trip as one expense. */
  spent: number;
};

// A digest anchored to THIS phone's own last visit rather than the calendar — useful
// specifically for someone who doesn't open the app daily, when "this week" would be
// too coarse and "today" would be empty.
const SinceLastOpenedCard = ({ previousOpenedAt, transactions, spent }: Props) => {
  usePrivacyMask(); // subscribe: the amount below reads formatMoney() directly

  // On its own at the right, so it reads "Today" like every row (gaps row 155).
  const copy = sinceCopy(
    relativeTime(previousOpenedAt, { style: "day" }),
    transactions,
    `${count(transactions, "transaction")} · ${formatMoney(spent)} spent`,
  );

  return (
    <PressableScale
      onPress={() => router.push("/activity")}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={copy.label}
    >
      <Card style={styles.card}>
        <View style={styles.row}>
          <Icon name="clock" size={14} color="inkDim" />
          <AppText size="sm" weight="semibold" color="inkSecondary" style={styles.grow}>
            {copy.title}
          </AppText>
          {copy.when && <AppText size="xs" weight="bold" color="inkDim">{copy.when}</AppText>}
        </View>
        {copy.body && (
          <AppText size="sm" weight="bold">
            {copy.body}
          </AppText>
        )}
      </Card>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: 4,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  grow: {
    flex: 1,
  },
});

export default SinceLastOpenedCard;
