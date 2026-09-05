import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import { useAccounts } from "@/lib/accounts";
import { haptics } from "@/lib/haptics";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { spacing } from "@/theme";

type Props = {
  selectedId?: string | null;
  /** What picking an account is FOR. Defaults to the transaction-form wording. */
  title?: string;
  onPick: (accountId: string) => void;
  /**
   * When given, a "No default" row is offered above the accounts. Only Settings
   * passes it — having no preselected account is a real preference there, while a
   * transaction form must always land on one. Kept separate from `onPick` so the
   * common case stays a plain `(id: string) => void`.
   */
  onClear?: () => void;
};

const AccountPickerSheet = forwardRef<BottomSheetModal, Props>((
  { selectedId, title = "Pay from", onPick, onClear },
  ref
) => {
  // Own handle, so `dismiss` closes *this* picker. `useBottomSheetModal().dismiss()`
  // targets the top of the provider-wide queue instead, which — while this picker
  // sits over the form that opened it — is not reliably the caller.
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const dismiss = () => innerRef.current?.dismiss();

  const accounts = useAccounts();
  usePrivacyMask(); // subscribe: a peek has to re-render the balances listed below

  return (
    <AppSheet ref={innerRef}>
      <AppText size="md" weight="black">
        {title}
      </AppText>
      <View style={styles.list}>
        {onClear && (
          // `select` throughout this sheet, not the default tap: every row here is one
          // choice out of a set, which is exactly what the OS reserves that tick for.
          <PressableScale
            style={[styles.row, selectedId == null && styles.rowSelected]}
            scaleTo={0.98}
            haptic={false}
            onPress={() => {
              haptics.select();
              onClear();
              dismiss();
            }}
          >
            <Icon
              name="close"
              size={20}
              containerSize={44}
              container="square"
              containerColor="surface2"
              color="inkDim"
            />
            <View style={styles.info}>
              <AppText size="sm" weight="bold">
                No default
              </AppText>
              <AppText size="xs" color="inkDim">
                Pick an account each time
              </AppText>
            </View>
            {selectedId == null && <Icon name="budgetOk" size={20} color="success" />}
          </PressableScale>
        )}
        {accounts.map((account) => {
          const selected = account._id === selectedId;
          return (
            <PressableScale
              key={account._id}
              style={[styles.row, selected && styles.rowSelected]}
              scaleTo={0.98}
              haptic={false}
              onPress={() => {
                haptics.select();
                onPick(account._id);
                dismiss();
              }}
            >
              <Icon
                name={(account.icon ?? "wallet") as IconName}
                size={20}
                containerSize={44}
                container="square"
                gradient={(account.color ?? "accent") as ColorToken}
              />
              <View style={styles.info}>
                <AppText size="sm" weight="bold">
                  {account.name}
                </AppText>
                <AppText size="xs" color="inkDim">
                  {formatMoney(account.balance)} available
                </AppText>
              </View>
              {selected && <Icon name="budgetOk" size={20} color="success" />}
            </PressableScale>
          );
        })}
      </View>
    </AppSheet>
  );
});

AccountPickerSheet.displayName = "AccountPickerSheet";

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  rowSelected: {
    borderColor: "rgba(163,148,255,0.5)",
    backgroundColor: "rgba(139,123,255,0.15)",
  },
  info: {
    flex: 1,
    gap: 2,
  },
});

export default AccountPickerSheet;
