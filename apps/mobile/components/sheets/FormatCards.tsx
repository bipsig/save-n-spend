import { StyleSheet, View } from "react-native";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import { AppText } from "@/components/ui/AppText";
import { haptics } from "@/lib/haptics";
import type { IconName } from "@/lib/icons";
import type { ExportFormat } from "@/lib/export";
import { colors, radius, spacing } from "@/theme";

const FORMATS: { key: ExportFormat; label: string; desc: string; icon: IconName }[] = [
  { key: "csv", label: "CSV", desc: "Spreadsheet", icon: "bills" },
  { key: "pdf", label: "PDF", desc: "Document", icon: "receipt" },
];

// The CSV / PDF chooser shared by the export sheets — two selectable cards, the
// active one ringed violet.
const FormatCards = ({ value, onChange }: { value: ExportFormat; onChange: (f: ExportFormat) => void }) => (
  <View style={styles.row}>
    {FORMATS.map((f) => {
      const on = value === f.key;
      return (
        // `select`, like the chip row above it in the export sheet — two cards are
        // still a set you're choosing between, not a commitment.
        <PressableScale
          key={f.key}
          onPress={() => {
            if (on) return; // re-picking the current format changes nothing, so it says nothing
            haptics.select();
            onChange(f.key);
          }}
          scaleTo={0.97}
          haptic={false}
          style={[styles.card, on && styles.cardOn]}
        >
          <Icon name={f.icon} size={18} color={on ? "primary" : "inkDim"} />
          <View style={styles.text}>
            <AppText size="sm" weight="bold" color={on ? "ink" : "inkDim"}>
              {f.label}
            </AppText>
            <AppText size="xs" color="inkDim">
              {f.desc}
            </AppText>
          </View>
        </PressableScale>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.md,
  },
  card: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
  },
  cardOn: {
    borderColor: colors.primary,
    backgroundColor: "rgba(139,123,255,0.14)",
  },
  text: {
    gap: 1,
  },
});

export default FormatCards;
