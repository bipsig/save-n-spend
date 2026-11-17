import { StyleSheet, View } from "react-native";
import Icon from "../ui/Icon";
import type { IconName } from "@/lib/icons";
import { colors } from "@/theme";

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
    backgroundColor: "rgba(139,123,255,0.15)",
    borderColor: "rgba(163,148,255,0.3)",
  },
  danger: {
    backgroundColor: colors.dangerSoft,
    borderColor: "rgba(255,107,116,0.35)",
  },
});

export default StateDisc;
