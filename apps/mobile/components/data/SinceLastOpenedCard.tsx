import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Card from "./Card";
import { AppText } from "../ui/AppText";
import Icon from "../ui/Icon";
import PressableScale from "../ui/PressableScale";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { count } from "@/lib/format/count";
import { formatInstant } from "@/lib/format/date";

type Props = {
  previousOpenedAt: string;
  transactions: number;
  spent: number;
};

// A digest anchored to THIS phone's own last visit rather than the calendar — useful
// specifically for someone who doesn't open the app daily, when "this week" would be
// too coarse and "today" would be empty.
const SinceLastOpenedCard = ({ previousOpenedAt, transactions, spent }: Props) => {
  usePrivacyMask(); // subscribe: the amount below reads formatMoney() directly

  const since = formatInstant(previousOpenedAt, "relativeDay");
  const body = transactions === 0
    ? `Nothing logged since ${since}`
    : `${count(transactions, "transaction")} · ${formatMoney(spent)} spent`;
  const label = `Since ${since}: ${body}. Opens Activity.`;

  return (
    <PressableScale
      onPress={() => router.push("/activity")}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Card style={styles.card}>
        <View style={styles.row}>
          <Icon name="clock" size={14} color="inkDim" />
          <AppText size="sm" weight="semibold" color="inkSecondary">
            Since {since}
          </AppText>
        </View>
        <AppText size="sm" weight="bold">
          {body}
        </AppText>
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
});

export default SinceLastOpenedCard;
