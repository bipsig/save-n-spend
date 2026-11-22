import { StyleSheet, View } from "react-native";
import type { INotification } from "@save-n-spend/types";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import MaskedText, { useMaskedLabel } from "@/components/ui/MaskedText";
import { LOOK } from "@/lib/notifications";
import { capitalise, formatInstant } from "@/lib/format/date";
import { colors, spacing } from "@/theme";

type Props = {
  notification: INotification;
  /** Suppress the top hairline — rows sit inside one card, separated by lines. */
  first?: boolean;
  onPress: () => void;
};

// One line of the feed. The type decides the chip; the server wrote the words.
const NotificationRow = ({ notification, first = false, onPress }: Props) => {
  const look = LOOK[notification.type];
  const unread = !notification.readAt;
  const time = capitalise(formatInstant(notification.createdAt, "relative"));
  const say = useMaskedLabel();

  return (
    // Same shallow ratio as the settings rows: a full-width row travels a long way at
    // the default, and the gap it opens at the card's edge reads as a glitch.
    <PressableScale
      onPress={onPress}
      scaleTo={0.985}
      accessibilityLabel={`${unread ? "Unread. " : ""}${say(notification.title)}. ${say(notification.body)}. ${time}`}
    >
      <View style={[styles.row, !first && styles.divider]}>
        <Icon
          name={look.icon}
          size={17}
          containerSize={34}
          containerRadius={11}
          container="square"
          gradient={look.tint}
        />

        <View style={styles.text}>
          {/* Read rows dim their title rather than vanish: the feed is a log, and what
              has already been seen should recede without becoming unreadable. */}
          <MaskedText size="sm" weight="bold" color={unread ? "ink" : "inkSecondary"}>
            {notification.title}
          </MaskedText>
          <MaskedText size="xs" color="inkDim" numberOfLines={2}>
            {notification.body}
          </MaskedText>
        </View>

        <View style={styles.meta}>
          <AppText size="xs" color="inkDim">
            {time}
          </AppText>
          {unread && <View style={styles.dot} />}
        </View>
      </View>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.surface2,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  meta: {
    alignItems: "flex-end",
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
});

export default NotificationRow;
