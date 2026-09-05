import { StyleSheet, View } from "react-native";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import { AppText } from "@/components/ui/AppText";
import { haptics } from "@/lib/haptics";
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
    {/* `select` rather than the default tap: stepping the window is moving through
        a set, and this is the one control people press repeatedly to get somewhere. */}
    <PressableScale
      onPress={() => {
        haptics.select();
        onPrev();
      }}
      scaleTo={0.9}
      haptic={false}
      hitSlop={8}
      accessibilityLabel="Previous period"
      style={styles.btn}
    >
      <Icon name="chevronLeft" size={24} color="ink" />
    </PressableScale>
    <AppText size="md" weight="bold" numberOfLines={1}>
      {label}
    </AppText>
    {/* At the current window there is no forward, so it neither dips nor ticks —
        the dimmed arrow and the silence say the same thing. */}
    <PressableScale
      onPress={() => {
        haptics.select();
        onNext();
      }}
      disabled={!canNext}
      scaleTo={0.9}
      haptic={false}
      hitSlop={8}
      accessibilityLabel="Next period"
      style={[styles.btn, !canNext && styles.off]}
    >
      <Icon name="chevronRight" size={24} color={canNext ? "ink" : "inkDim"} />
    </PressableScale>
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
