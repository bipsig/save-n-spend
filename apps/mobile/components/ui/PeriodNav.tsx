import { Pressable, StyleSheet, View } from "react-native";
import Icon from "@/components/ui/Icon";
import { AppText } from "@/components/ui/AppText";
import { radius } from "@/theme";

type Props = {
  label: string;
  canNext: boolean; // forward is disabled at the current window (no future)
  onPrev: () => void;
  onNext: () => void;
};

// Step backward/forward through periods — a centered window label flanked by
// chevron buttons. Shared by Insights and Activity.
const PeriodNav = ({ label, canNext, onPrev, onNext }: Props) => (
  <View style={styles.nav}>
    <Pressable onPress={onPrev} hitSlop={8} style={styles.btn}>
      <Icon name="chevronLeft" size={24} color="ink" />
    </Pressable>
    <AppText size="md" weight="bold" numberOfLines={1}>
      {label}
    </AppText>
    <Pressable onPress={onNext} disabled={!canNext} hitSlop={8} style={[styles.btn, !canNext && styles.off]}>
      <Icon name="chevronRight" size={24} color={canNext ? "ink" : "inkDim"} />
    </Pressable>
  </View>
);

const styles = StyleSheet.create({
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  btn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  off: {
    opacity: 0.35,
  },
});

export default PeriodNav;
