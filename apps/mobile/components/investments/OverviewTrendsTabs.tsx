import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import PressableScale from "@/components/ui/PressableScale";
import { colors, radius } from "@/theme";

export type InvestTab = "overview" | "trends";

const OverviewTrendsTabs = ({ tab, onChange }: { tab: InvestTab; onChange: (t: InvestTab) => void }) => (
  <View style={styles.seg}>
    {(["overview", "trends"] as const).map((t) => (
      <PressableScale key={t} onPress={() => onChange(t)} scaleTo={0.97} style={[styles.item, tab === t && styles.on]} accessibilityRole="tab" accessibilityState={{ selected: tab === t }}>
        <AppText size="sm" weight="bold" color={tab === t ? "ink" : "inkDim"}>{t === "overview" ? "Overview" : "Trends"}</AppText>
      </PressableScale>
    ))}
  </View>
);

const styles = StyleSheet.create({
  seg: { flexDirection: "row", backgroundColor: colors.glass, borderRadius: radius.md, padding: 3, borderWidth: 1, borderColor: colors.glassBorder },
  item: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: radius.md - 3 },
  on: { backgroundColor: colors.accentSoft },
});

export default OverviewTrendsTabs;
