import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { RecurringPattern } from "@save-n-spend/types";
import AppSheet from "./AppSheet";
import { AppText } from "@/components/ui/AppText";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import Money from "@/components/ui/Money";
import { useCategoryById } from "@/lib/categories";
import { usePrivacyMask } from "@/lib/money";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { spacing } from "@/theme";

type Props = {
  suggestions: RecurringPattern[];
  /** Opens the bill sheet prefilled from this suggestion. */
  onAdd: (pattern: RecurringPattern) => void;
  /** "Not recurring" — resolves once it's remembered. */
  onDismiss: (pattern: RecurringPattern) => Promise<void>;
};

const SuggestionRow = ({ pattern, busy, onAdd, onDismiss }: {
  pattern: RecurringPattern;
  busy: boolean;
  onAdd: () => void;
  onDismiss: () => void;
}) => {
  const category = useCategoryById(pattern.category);
  return (
    <View style={styles.row}>
      <View style={styles.top}>
        <Icon
          name={pattern.looksLikeSip ? "investments" : ((category?.icon ?? "repeat") as IconName)}
          size={18}
          container="square"
          containerSize={40}
          containerRadius={13}
          gradient={pattern.looksLikeSip ? "green" : ((category?.color ?? "accent") as ColorToken)}
        />
        <View style={styles.text}>
          <AppText size="sm" weight="bold" numberOfLines={1}>{pattern.title}</AppText>
          <AppText size="xs" color="inkDim" numberOfLines={1}>
            {pattern.looksLikeSip ? "Looks like a SIP · " : ""}Every month · seen {pattern.occurrences} months
          </AppText>
        </View>
        <Money value={pattern.amount} size="sm" weight="black" align="right" />
      </View>
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button
            label={pattern.looksLikeSip ? "Set up SIP" : "Add as bill"}
            size="sm"
            onPress={onAdd}
            disabled={busy}
          />
        </View>
        <View style={styles.action}>
          <Button label="Not recurring" size="sm" variant="ghost" onPress={onDismiss} loading={busy} disabled={busy} />
        </View>
      </View>
    </View>
  );
};

// The review list behind "We found N recurring payments". Each one is a decision, not an
// import: adding opens the bill sheet prefilled so nothing is created without a look, and
// "Not recurring" is remembered so it never comes back.
const RecurringSuggestionsSheet = forwardRef<BottomSheetModal, Props>(({ suggestions, onAdd, onDismiss }, ref) => {
  usePrivacyMask();
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  return (
    <AppSheet ref={innerRef} scrollable>
      <View style={styles.header}>
        <Icon name="repeat" size={22} container="square" containerSize={48} containerRadius={16} gradient="blue" />
        <View style={styles.text}>
          <AppText size="md" weight="black">Recurring payments</AppText>
          <AppText size="xs" color="inkDim">
            These showed up about once a month. Make them bills to get reminded and see them on your cash-flow calendar.
          </AppText>
        </View>
      </View>

      {suggestions.length === 0 ? (
        <AppText size="sm" color="inkDim">All caught up — nothing new to review.</AppText>
      ) : suggestions.map((pattern) => (
        <SuggestionRow
          key={pattern.key}
          pattern={pattern}
          busy={busyKey === pattern.key}
          onAdd={() => {
            innerRef.current?.dismiss();
            onAdd(pattern);
          }}
          onDismiss={async () => {
            setBusyKey(pattern.key);
            try {
              await onDismiss(pattern);
            }
            finally {
              setBusyKey(null);
            }
          }}
        />
      ))}
    </AppSheet>
  );
});

RecurringSuggestionsSheet.displayName = "RecurringSuggestionsSheet";

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  row: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  action: {
    flex: 1,
  },
});

export default RecurringSuggestionsSheet;
