import { StyleSheet, View } from "react-native";
import { AppText } from "./AppText";
import Icon from "./Icon";
import PressableScale from "./PressableScale";

type Props = {
  label: string;
  actionLabel?: string;
  onAction?: () => void;
};

// Spec .seclabel — an uppercase tracked section label with an optional
// violet "View all ›" link on the right (dashboard previews, and anywhere a
// section points at its full screen).
const SectionHeader = ({ label, actionLabel = "View all", onAction }: Props) => (
  <View style={styles.row}>
    <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
      {label}
    </AppText>
    {onAction && (
      // Deep, like every other bare-text target: two words and a 14px chevron have
      // no surface to shrink, so a row's shallow squeeze wouldn't read at all.
      <PressableScale onPress={onAction} scaleTo={0.9} hitSlop={8} style={styles.link} accessibilityRole="link">
        <AppText size="xs" weight="bold" color="primary">
          {actionLabel}
        </AppText>
        <Icon name="chevronRight" size={14} color="primary" />
      </PressableScale>
    )}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    letterSpacing: 1.3,
  },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
});

export default SectionHeader;
