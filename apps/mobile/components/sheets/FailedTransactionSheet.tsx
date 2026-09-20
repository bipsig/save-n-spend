import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import { AppText } from "@/components/ui/AppText";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { haptics } from "@/lib/haptics";
import { spacing } from "@/theme";

type Props = {
  /** The server's own reason, so the user knows what to fix before retrying as-is. */
  error: string | null;
  onRetry: () => void;
  onEdit: () => void;
  onDiscard: () => void;
};

// What a queued transaction becomes once the server has actually rejected the replay —
// not merely unsynced, but wrong. Three ways out, never a silent drop: try again as-is
// (the thing it names may already be fixed elsewhere), open it as a fresh draft to change
// whatever the server objected to, or give up on it.
const FailedTransactionSheet = forwardRef<BottomSheetModal, Props>((
  { error, onRetry, onEdit, onDiscard },
  ref
) => {
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const dismiss = () => innerRef.current?.dismiss();

  const [discarding, setDiscarding] = useState(false);

  return (
    <AppSheet ref={innerRef} onDismiss={() => setDiscarding(false)}>
      <View style={styles.identity}>
        <Icon name="cloudOff" size={24} containerSize={52} container="square" gradient="red" />
        <View style={styles.identityText}>
          <AppText size="md" weight="black">
            Couldn't sync
          </AppText>
          <AppText size="sm" color="inkDim">
            {error ?? "The server rejected this transaction."}
          </AppText>
        </View>
      </View>

      <View style={styles.actions}>
        <Button label="Retry" onPress={() => { haptics.tap(); dismiss(); onRetry(); }} />
        <Button label="Edit as new draft" variant="secondary" onPress={() => { haptics.tap(); dismiss(); onEdit(); }} />
        <Button
          label="Discard"
          variant="danger"
          loading={discarding}
          onPress={() => { setDiscarding(true); haptics.tap(); dismiss(); onDiscard(); }}
        />
      </View>
    </AppSheet>
  );
});

FailedTransactionSheet.displayName = "FailedTransactionSheet";

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
});

export default FailedTransactionSheet;
