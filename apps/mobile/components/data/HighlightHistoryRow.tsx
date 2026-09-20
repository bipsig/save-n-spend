import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { IHighlightLog } from "@save-n-spend/types";
import Card from "./Card";
import { AppText } from "../ui/AppText";
import Icon from "../ui/Icon";
import PressableScale from "../ui/PressableScale";
import { SCREEN_LABEL, SCREEN_ROUTE, SEVERITY_COLOR, SEVERITY_ICON, SEVERITY_LABEL } from "@/lib/highlights";
import { formatFullDate } from "@/lib/date";
import { haptics } from "@/lib/haptics";
import { spacing } from "@/theme";

type Props = {
  entry: IHighlightLog;
};

// A permanent record, not a live card — no dismiss, no fading after a week. Deliberately
// plainer than HighlightCard: the chrome that matters here is the date, not an action.
const HighlightHistoryRow = ({ entry }: Props) => {
  const open = () => {
    if (!entry.screen) return;
    haptics.tap();
    router.push(SCREEN_ROUTE[entry.screen] as never);
  };

  const label = `${formatFullDate(entry.createdAt)}: ${SEVERITY_LABEL[entry.severity]}, ${entry.title}. ${entry.body}`
    + (entry.screen ? ` Opens ${SCREEN_LABEL[entry.screen]}.` : "");

  return (
    <PressableScale
      onPress={entry.screen ? open : undefined}
      disabled={!entry.screen}
      scaleTo={0.98}
      haptic={false}
      accessibilityRole={entry.screen ? "button" : undefined}
      accessibilityLabel={label}
    >
      <Card style={styles.card}>
        <View style={styles.head}>
          <Icon
            name={SEVERITY_ICON[entry.severity]}
            size={14}
            containerSize={28}
            containerRadius={9}
            container="square"
            containerColor="surface2"
            color={SEVERITY_COLOR[entry.severity]}
          />
          <AppText size="xs" weight="bold" color={SEVERITY_COLOR[entry.severity]} style={styles.severity}>
            {SEVERITY_LABEL[entry.severity]}
          </AppText>
          <AppText size="xs" color="inkDim">
            {formatFullDate(entry.createdAt)}
          </AppText>
        </View>
        <AppText size="sm" weight="bold" style={styles.title}>
          {entry.title}
        </AppText>
        <AppText size="xs" color="inkDim" style={styles.body}>
          {entry.body}
        </AppText>
      </Card>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  severity: {
    flex: 1,
  },
  title: {
    lineHeight: 19,
  },
  body: {
    lineHeight: 16,
  },
});

export default HighlightHistoryRow;
