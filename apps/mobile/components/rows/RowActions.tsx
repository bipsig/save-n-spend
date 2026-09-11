import { StyleSheet, View } from "react-native";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";

// Wide sideways, tight vertically: the two targets are stacked, so a symmetric slop
// would make them overlap and hand the wrong one the touch.
const HIT = { top: 2, bottom: 2, left: 10, right: 10 } as const;

type Props = {
  /** Names the thing in both labels, so a screen reader doesn't just hear "Edit". */
  label: string;
  onEdit: () => void;
  onDelete: () => void;
};

// The edit/delete pair a card carries on its own management screen — passed nowhere
// else, so the same row still reads as a summary on the dashboard.
//
// Stacked rather than side by side: the row already spends its horizontal space on an
// amount and a badge, and a column costs one glyph's width instead of two. Both are
// nested pressables, which take the touch responder from the card around them, so
// neither can fire the row's own action by mistake.
const RowActions = ({ label, onEdit, onDelete }: Props) => (
  <View style={styles.column}>
    <PressableScale
      onPress={onEdit}
      scaleTo={0.88}
      hitSlop={HIT}
      accessibilityLabel={`Edit ${label}`}
      style={styles.hit}
    >
      <Icon name="edit" size={17} color="inkDim" />
    </PressableScale>
    <PressableScale
      onPress={onDelete}
      scaleTo={0.88}
      hitSlop={HIT}
      accessibilityLabel={`Delete ${label}`}
      style={styles.hit}
    >
      <Icon name="delete" size={17} color="danger" />
    </PressableScale>
  </View>
);

const styles = StyleSheet.create({
  column: {
    alignItems: "center",
    gap: 2,
    marginLeft: 2,
  },
  // A bare glyph has no surface of its own; the padding is the target.
  hit: {
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
});

export default RowActions;
