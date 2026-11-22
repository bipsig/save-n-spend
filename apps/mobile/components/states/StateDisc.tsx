import { StyleSheet, View } from "react-native";
import Icon from "../ui/Icon";
import type { IconName } from "@/lib/icons";
import { colors, withAlpha } from "@/theme";

type Props = {
  icon: IconName;
  tone?: "accent" | "danger";
};

// The 64 pt disc that opens EmptyState and ErrorState, so the two read as one family.
const StateDisc = ({ icon, tone = "accent" }: Props) => (
  <View style={[styles.disc, tone === "danger" ? styles.danger : styles.accent]}>
    <Icon name={icon} size={30} color={tone === "danger" ? "danger" : "accentLight"} />
  </View>
);

const styles = StyleSheet.create({
  disc: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  accent: {
    backgroundColor: withAlpha(colors.brandLight, 0.15),
    borderColor: withAlpha(colors.seriesViolet, 0.3),
  },
  danger: {
    backgroundColor: colors.dangerSoft,
    borderColor: withAlpha(colors.danger, 0.35),
  },
});

export default StateDisc;
