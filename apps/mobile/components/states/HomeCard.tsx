import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Card from "../data/Card";
import { AppText } from "../ui/AppText";
import Caps from "../ui/Caps";
import Icon from "../ui/Icon";
import { homeCardView, stacksAction, type ScreenState } from "@/lib/screenStates";
import { spacing, touchTarget } from "@/theme";

type Props = {
  /** The card's own caption, kept on the error box: "Budgets at a glance". Also keys its height. */
  title: string;
  state: Pick<ScreenState, "hasData" | "error" | "refetch">;
  /** Loaded with nothing to show: the card isn't drawn. */
  empty?: boolean;
  /** The card's usual height, for an error before it ever loaded. */
  skeletonHeight: number;
  children: React.ReactNode;
};

// Last drawn height per card, kept across Home remounts in this app run.
const heights = new Map<string, number>();

/** D16 A: a Home card that fails keeps its place, its title and its height, and says so inside.
 *  While loading it draws nothing, as the cards did before. */
const HomeCard = ({ title, state, empty, skeletonHeight, children }: Props) => {
  const view = homeCardView({ hasData: state.hasData, error: state.error, empty });
  const stacked = stacksAction(useWindowDimensions().fontScale);
  if (view === "hidden") return null;
  if (view === "content") {
    return <View onLayout={(e) => heights.set(title, e.nativeEvent.layout.height)}>{children}</View>;
  }

  const message = (
    <>
      <Icon name="alert" size={14} color="danger" />
      <AppText size="xs" color="inkDim" weight="semibold" style={styles.text}>
        Couldn't load this
      </AppText>
    </>
  );
  const action = (
    <Pressable
      onPress={() => void state.refetch()}
      hitSlop={(touchTarget - 16) / 2}
      accessibilityRole="button"
      accessibilityLabel={`Couldn't load ${title}. Try again`}
    >
      <AppText size="xs" color="accentLight" weight="bold">
        Try again
      </AppText>
    </Pressable>
  );

  return (
    <Card style={[styles.card, { minHeight: heights.get(title) ?? skeletonHeight }]}>
      <Caps>{title}</Caps>
      {/* At the accessibility text sizes "Try again" goes under the message (W-4). */}
      {stacked ? (
        <View style={styles.stacked}>
          <View style={styles.row}>{message}</View>
          {action}
        </View>
      ) : (
        <View style={styles.body}>
          {message}
          {action}
        </View>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  body: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stacked: { flex: 1, justifyContent: "center", alignItems: "flex-start", gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, alignSelf: "stretch" },
  text: { flex: 1 },
});

export default HomeCard;
