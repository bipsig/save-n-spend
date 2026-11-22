import { StyleSheet, View } from "react-native";
import { AppText } from "./AppText";
import Caps from "./Caps";
import FieldError from "./FieldError";
import Icon from "./Icon";
import PressableScale from "./PressableScale";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import type { ChipTint } from "@/theme/gradients";
import { colors } from "@/theme";

type Props = {
  /** The caps line over the value. Omit for the value-only form (an account, a toggle). */
  label?: string;
  /** Text, or a node such as `<CategoryName/>` or `<Money/>`. Empty shows `placeholder`. */
  value?: React.ReactNode;
  placeholder?: string;
  /** What VoiceOver reads for the value when `value` is a node. */
  valueText?: string;
  /** An 18 pt dim glyph… */
  icon?: IconName;
  /** …or a 34 pt gradient chip (a category, a holding). */
  chip?: { icon: IconName; gradient: ChipTint | ColorToken };
  /** Absent: a read-only row, no chevron, not a button. */
  onPress?: () => void;
  chevron?: "right" | "down" | "none";
  /** The closed split / extras toggle. */
  dim?: boolean;
  /** The field's own problem, under the row (gaps row 118). */
  error?: string | null;
  /** For a row that opens a section (the split, the extras). */
  expanded?: boolean;
  /** When the spoken label isn't "label, value" (a toggle that sums up what it holds). */
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

// The "tap to pick" row (gaps row 47): leading icon, caps label over a bold value, chevron.
// One style for every form; `DateField` is one of these.
const FieldRow = ({ label, value, placeholder, valueText, icon, chip, onPress, chevron, dim = false, error, expanded, accessibilityLabel, accessibilityHint }: Props) => {
  const empty = value === undefined || value === null || value === "";
  const shown = empty ? (
    <AppText size="sm" weight="semibold" color="inkDim">{placeholder}</AppText>
  ) : typeof value === "string" ? (
    <AppText size="sm" weight={dim ? "semibold" : "bold"} color={dim ? "inkDim" : "ink"} numberOfLines={1}>{value}</AppText>
  ) : (
    value
  );
  const spoken = empty ? placeholder : typeof value === "string" ? value : valueText;
  const a11yLabel = accessibilityLabel ?? [label, spoken].filter(Boolean).join(", ");
  const arrow = chevron ?? (onPress ? "right" : "none");

  const body = (
    <>
      {chip ? (
        <Icon name={chip.icon} size={17} containerSize={34} containerRadius={11} container="square" gradient={chip.gradient} />
      ) : icon ? (
        <Icon name={icon} size={18} color="inkDim" />
      ) : null}
      <View style={styles.text}>
        {label ? <Caps>{label}</Caps> : null}
        {shown}
      </View>
      {arrow !== "none" && <Icon name={arrow === "down" ? "chevronDown" : "chevronRight"} size={20} color="inkDim" />}
    </>
  );

  return (
    <View style={styles.wrap}>
      {onPress ? (
        <PressableScale
          style={[styles.row, dim && styles.dim]}
          onPress={onPress}
          scaleTo={0.98}
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          accessibilityHint={accessibilityHint}
          accessibilityState={expanded === undefined ? undefined : { expanded }}
        >
          {body}
        </PressableScale>
      ) : (
        <View style={[styles.row, dim && styles.dim]} accessible accessibilityLabel={a11yLabel}>
          {body}
        </View>
      )}
      <FieldError message={error} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
  },
  text: { flex: 1, gap: 2 },
  dim: { opacity: 0.75 },
});

export default FieldRow;
