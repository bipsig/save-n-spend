import { StyleSheet, View } from "react-native";
import { AppText } from "../ui/AppText";
import Button from "../ui/Button";
import StateDisc from "./StateDisc";
import { goBackOrHome } from "@/lib/navigation";
import { spacing } from "@/theme";

type Props = {
  /** What's missing, lower case: "trip", "goal", "transaction". */
  thing: string;
  subtitle?: string;
  onBack?: () => void;
};

// A record that isn't there (a 404, or no id to load): one screen for all of them.
const NotFoundState = ({ thing, subtitle = "It may have been deleted on another phone", onBack = goBackOrHome }: Props) => (
  <View style={styles.container}>
    <StateDisc icon="search" />
    <AppText weight="black" size="md" style={styles.text}>
      {`This ${thing} isn't here any more`}
    </AppText>
    <AppText size="sm" color="inkDim" style={styles.text}>
      {subtitle}
    </AppText>
    <View style={styles.action}>
      <Button label="Go back" variant="secondary" pill onPress={onBack} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing["3xl"],
  },
  text: {
    textAlign: "center",
    maxWidth: 240,
  },
  action: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
});

export default NotFoundState;
