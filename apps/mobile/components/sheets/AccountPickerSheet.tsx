import { forwardRef, useImperativeHandle, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import { useAccounts } from "@/lib/accounts";
import formatMoney from "@/lib/money";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { spacing } from "@/theme";

type Props = {
  selectedId?: string | null;
  onPick: (accountId: string) => void;
};

const AccountPickerSheet = forwardRef<BottomSheetModal, Props>(({ selectedId, onPick }, ref) => {
  // Own handle, so `dismiss` closes *this* picker. `useBottomSheetModal().dismiss()`
  // targets the top of the provider-wide queue instead, which — while this picker
  // sits over the form that opened it — is not reliably the caller.
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const dismiss = () => innerRef.current?.dismiss();

  const accounts = useAccounts();

  return (
    <AppSheet ref={innerRef}>
      <AppText size="md" weight="black">
        Pay from
      </AppText>
      <View style={styles.list}>
        {accounts.map((account) => {
          const selected = account._id === selectedId;
          return (
            <Pressable
              key={account._id}
              style={[styles.row, selected && styles.rowSelected]}
              onPress={() => {
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
            </Pressable>
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
