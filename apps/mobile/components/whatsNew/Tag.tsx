import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { colors } from "@/theme";

// The small caps tag: "NEW" on Settings, "YOU'RE ON THIS" on the timeline and on a
// version's band. `band` sits on a gradient, the same treatment as a trip card's tag.
const Tag = ({ label, tone = "new" }: { label: string; tone?: "new" | "band" }) => (
  <View style={[styles.tag, tone === "band" ? styles.band : styles.new]}>
    <AppText size="xs" weight="black" color={tone === "band" ? "ink" : "primary"} style={styles.text}>
      {label}
    </AppText>
  </View>
);

const styles = StyleSheet.create({
  tag: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  new: { backgroundColor: colors.accentSoft },
  band: { backgroundColor: "rgba(0,0,0,0.25)" },
  text: { fontSize: 9.5, letterSpacing: 0.4, lineHeight: 12 },
});

export default Tag;
