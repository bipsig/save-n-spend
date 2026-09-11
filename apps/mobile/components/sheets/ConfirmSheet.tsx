import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import { AppText } from "@/components/ui/AppText";
import Button from "@/components/ui/Button";
import HoldButton from "@/components/ui/HoldButton";
import Icon from "@/components/ui/Icon";
import { haptics } from "@/lib/haptics";
import type { IconName } from "@/lib/icons";
import { spacing } from "@/theme";

type Props = {
  icon: IconName;
  title: string;
  /** What actually happens, in plain terms. One decision, no typing (spec Tier-1). */
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` for anything destructive; `primary` for a neutral confirm. */
  tone?: "danger" | "primary";
  /**
   * Require a 1.5s hold instead of a tap. For the one action that cannot be
   * undone at all — see HoldButton.
   */
  hold?: boolean;
  /** Awaited; the sheet stays open on a rejection so the message can be read. */
  onConfirm: () => Promise<void> | void;
};

// The shared Tier-1 confirm: a titled consequence and two ways out. Every
// destructive action in Settings routes through this rather than a bare Alert, so
// they all state their consequence in the same voice and the same place.
const ConfirmSheet = forwardRef<BottomSheetModal, Props>((
  { icon, title, body, confirmLabel, cancelLabel = "Cancel", tone = "danger", hold = false, onConfirm },
  ref
) => {
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const dismiss = () => innerRef.current?.dismiss();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setBusy(false);
    setError(null);
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      dismiss();
    }
    catch (err) {
      // The one failure that must not be missed: the user just agreed to something
      // destructive, so if it didn't happen they need to know before they walk away
      // believing it did. The buzz arrives before the sentence can be read.
      haptics.error();
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
    }
    finally {
      setBusy(false);
    }
  };

  return (
    // No pinned footer, unlike the form sheets: nothing here scrolls, so a bar of its own
    // would only add a divider and a band of dead space under two buttons.
    <AppSheet ref={innerRef} onDismiss={reset}>
      <View style={styles.identity}>
        <Icon
          name={icon}
          size={24}
          containerSize={52}
          container="square"
          gradient={tone === "danger" ? "red" : "violet"}
        />
        <View style={styles.identityText}>
          <AppText size="md" weight="black">
            {title}
          </AppText>
          <AppText size="sm" color="inkDim">
            {body}
          </AppText>
        </View>
      </View>

      {hold && (
        <AppText size="xs" color="inkDim" style={styles.hint}>
          Press and hold for a moment. Let go to cancel.
        </AppText>
      )}

      {error && (
        <AppText size="sm" color="danger" style={styles.hint}>
          {error}
        </AppText>
      )}

      <View style={styles.actions}>
        {hold ? (
          <HoldButton
            label={confirmLabel}
            holdingLabel="Keep holding to delete…"
            icon="delete"
            loading={busy}
            onComplete={run}
          />
        ) : (
          <Button label={confirmLabel} variant={tone} loading={busy} onPress={run} />
        )}
        <Button label={cancelLabel} variant="ghost" disabled={busy} onPress={dismiss} />
      </View>
    </AppSheet>
  );
});

ConfirmSheet.displayName = "ConfirmSheet";

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
  actions: {
    gap: spacing.sm,
  },
  hint: {
    textAlign: "center",
  },
});

export default ConfirmSheet;
