import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import Toggle from "@/components/ui/Toggle";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import type { ChipTint } from "@/theme/gradients";
import { spacing } from "@/theme";

type Base = {
  label: string;
  icon: IconName;
  /** Chip tint. Ignored by `danger`, which is always red. */
  tint?: ChipTint | ColorToken;
  /** One line stating exactly what the row does — spelled out, not implied. */
  sub?: string;
  /** Suppress the top hairline: rows are separated inside one card, never by margins. */
  first?: boolean;
  /**
   * A row that exists but cannot be changed yet (spec: Currency). Dimmed and
   * inert rather than hidden, so the app says what it has decided for you
   * instead of leaving you looking for the setting.
   */
  locked?: boolean;
  /** Temporarily inapplicable — e.g. the four rows under a master switch that is off. */
  dimmed?: boolean;
};

// Four row shapes, and TypeScript narrows the props to exactly one of them: a
// `toggle` has no `onPress` to give it a chevron, and a `nav` has no `value` to
// print. The compiler, not a review comment, is what keeps the four honest.
type Nav = Base & { kind: "nav"; onPress: () => void };
type Value = Base & { kind: "value"; value: string; onPress?: () => void };
type Toggleable = Base & { kind: "toggle"; on: boolean; onToggle: (next: boolean) => void };
type Danger = Base & { kind: "danger"; onPress: () => void };

export type SettingsRowProps = Nav | Value | Toggleable | Danger;

// Spec .srow — 34px gradient chip · 14/700 label (+ optional dim sub-line) ·
// the kind-specific control on the right.
const SettingsRow = (props: SettingsRowProps) => {
  const { label, icon, tint = "blue", sub, first = false, locked = false, dimmed = false } = props;

  const danger = props.kind === "danger";
  // A locked row is never pressable; a dimmed one still is, because a master
  // switch turning its children grey should not also hide what they say.
  const onPress = locked ? undefined : props.kind === "toggle" ? undefined : props.onPress;
  const faded = locked || dimmed;

  const body = (
    <View style={[styles.row, !first && styles.divider, faded && styles.faded]}>
      {danger ? (
        <Icon
          name={icon}
          size={17}
          containerSize={34}
          containerRadius={11}
          container="square"
          containerColor="dangerSoft"
          color="danger"
        />
      ) : (
        <Icon
          name={icon}
          size={17}
          containerSize={34}
          containerRadius={11}
          container="square"
          gradient={tint}
        />
      )}

      <View style={styles.text}>
        <AppText size="sm" weight="bold" color={danger ? "danger" : "ink"}>
          {label}
        </AppText>
        {sub && (
          <AppText size="xs" color="inkDim">
            {sub}
          </AppText>
        )}
      </View>

      {props.kind === "toggle" && (
        <Toggle value={props.on} onValueChange={props.onToggle} disabled={locked} />
      )}

      {props.kind === "value" && (
        <AppText size="xs" weight="semibold" color="inkDim" numberOfLines={1}>
          {props.value}
        </AppText>
      )}

      {/* A chevron promises somewhere to go: only where a tap actually leads. */}
      {onPress && <Icon name="chevronRight" size={18} color="inkDim" />}
    </View>
  );

  if (!onPress) return body;

  // Shallower than the default 0.97 — a full-width row travels a long way at that
  // ratio, and the gap it opens beside the card's edge reads as a glitch.
  return (
    <PressableScale onPress={onPress} scaleTo={0.985}>
      {body}
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
  // spec: rows inside one glass card, separated by hairlines
  divider: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  faded: {
    opacity: 0.55, // spec locked row
  },
  text: {
    flex: 1,
    gap: 2,
  },
});

export default SettingsRow;
