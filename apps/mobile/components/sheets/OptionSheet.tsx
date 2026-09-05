import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import { AppText } from "@/components/ui/AppText";
import Chip from "@/components/ui/Chip";
import Icon from "@/components/ui/Icon";
import { haptics } from "@/lib/haptics";
import type { IconName } from "@/lib/icons";
import { spacing } from "@/theme";

export type Option = { value: number; label: string };

type Props = {
  icon: IconName;
  title: string;
  /** What the choice changes. Every option sheet says it, none of them imply it. */
  subtitle?: string;
  options: Option[];
  value: number;
  /** Awaited, so a failed save keeps the sheet open with the reason. */
  onPick: (value: number) => Promise<void> | void;
};

// The shared Tier-2 value picker (spec §08): bill reminder lead, auto-lock timing.
// Picking IS the decision, so there is no separate save button — the sheet closes
// once the choice has landed.
//
// For a choice too large to be a row of chips — the time zone — see TimeZoneSheet,
// which adds search rather than stretching this one.
const OptionSheet = forwardRef<BottomSheetModal, Props>((
  { icon, title, subtitle, options, value, onPick },
  ref
) => {
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const dismiss = () => innerRef.current?.dismiss();

  // Which option is mid-save, so only that one shows as pending.
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPending(null);
    setError(null);
  };

  const choose = async (next: number) => {
    if (pending !== null) return;
    setPending(next);
    setError(null);
    try {
      await onPick(next);
      dismiss();
    }
    catch (err) {
      // Kept in the sheet rather than toasted: the sheet stays open on failure, and
      // the reason belongs beside the option that refused. The buzz is what makes it
      // noticeable — the chip just goes back to looking unpicked otherwise.
      haptics.error();
      setError(err instanceof Error ? err.message : "Couldn't save that. Try again.");
      setPending(null);
    }
  };

  return (
    <AppSheet ref={innerRef} onDismiss={reset}>
      <View style={styles.identity}>
        <Icon name={icon} size={24} containerSize={52} container="square" gradient="accent" />
        <View style={styles.identityText}>
          <AppText size="md" weight="black">
            {title}
          </AppText>
          {subtitle && (
            <AppText size="sm" color="inkDim">
              {subtitle}
            </AppText>
          )}
        </View>
      </View>

      <View style={styles.chips}>
        {options.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            grow
            selected={option.value === value}
            disabled={pending !== null && pending !== option.value}
            onPress={() => choose(option.value)}
          />
        ))}
      </View>

      {error && (
        <AppText size="sm" color="danger" style={styles.error}>
          {error}
        </AppText>
      )}
    </AppSheet>
  );
});

OptionSheet.displayName = "OptionSheet";

const styles = StyleSheet.create({
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  identityText: {
    flex: 1,
    gap: 3,
  },
  chips: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  error: {
    textAlign: "center",
  },
});

export default OptionSheet;
