import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { spacing } from "@/theme";

type Props = {
  icon: IconName;
  color: ColorToken;
  label: string;
  /** One line of context — a balance, a type, a count. */
  sub?: string;
  /** Tapping the row body edits; the trailing button is the only way to delete. */
  onEdit: () => void;
  onDelete: () => void;
  /** Suppress the top hairline: rows are separated inside one card, never by margins. */
  first?: boolean;
  /**
   * A sub-category, drawn one step in behind a rail. Indentation rather than a word:
   * the relationship is to the row above, and a row that says "sub-category" in text
   * still leaves the reader hunting for which parent it belongs to.
   */
  nested?: boolean;
};

// A row on Manage categories / Manage accounts. The whole row edits; delete is a
// separate, smaller target at the end — so the destructive action can't be hit by
// a tap aimed at opening the editor.
const ManageRow = ({ icon, color, label, sub, onEdit, onDelete, first = false, nested = false }: Props) => (
  <View style={[styles.row, !first && styles.divider, nested && styles.rowNested]}>
    {/* Shallower than the default, like SettingsRow: a full-width row travels a long
        way at 0.97, and the gap it opens beside the card's edge reads as a glitch. */}
    <PressableScale onPress={onEdit} scaleTo={0.985} style={styles.body}>
      <Icon
        name={icon}
        size={nested ? 15 : 17}
        containerSize={nested ? 29 : 34}
        containerRadius={nested ? 9 : 11}
        container="square"
        gradient={color}
      />
      <View style={styles.text}>
        {/* Semibold, not bold: the weight difference is the second cue after the
            indent, so a group reads as one heading with items under it. */}
        <AppText size="sm" weight={nested ? "semibold" : "bold"} numberOfLines={1}>
          {label}
        </AppText>
        {sub && (
          <AppText size="xs" color="inkDim" numberOfLines={1}>
            {sub}
          </AppText>
        )}
      </View>
      <Icon name="edit" size={17} color="inkDim" />
    </PressableScale>

    {/* Deeper: a bare glyph has no surface to shrink, so it needs the extra travel to
        register as a press at all. */}
    <PressableScale
      onPress={onDelete}
      scaleTo={0.88}
      hitSlop={8}
      accessibilityLabel={`Delete ${label}`}
      style={styles.delete}
    >
      <Icon name="delete" size={18} color="danger" />
    </PressableScale>
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  // spec: rows inside one glass card, separated by hairlines
  divider: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  // The indent plus a rail that runs the height of the row, so a run of children
  // reads as one continuous line hanging off the parent rather than as stray inset
  // rows. Brighter than the divider on purpose — it has to survive being crossed by
  // one every row.
  rowNested: {
    paddingLeft: 30,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.14)",
    marginLeft: 24,
  },
  body: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 13,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  delete: {
    paddingLeft: spacing.lg,
    paddingVertical: 13,
  },
});

export default ManageRow;
