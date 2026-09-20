import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import Button from "@/components/ui/Button";
import { createAccount, useAccounts } from "@/lib/accounts";
import { useConnectivity } from "@/store/connectivity";
import { toast } from "@/store/toast";
import { haptics } from "@/lib/haptics";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import type { IconName } from "@/lib/icons";
import type { AccountType } from "@save-n-spend/types";
import type { ColorToken } from "@/theme";
import { colors, spacing } from "@/theme";
import { KEYBOARD_DONE_ID } from "@/components/ui/KeyboardDoneBar";

// A person account's balance is a receivable, not spendable funds — "available" would
// read backwards. Positive = they owe the user; negative = the user owes them.
const owedLine = (balance: number): string => {
  if (balance === 0) return "Settled up";
  return balance > 0 ? `Owes you ${formatMoney(balance)}` : `You owe ${formatMoney(-balance)}`;
};

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
  /** Restricts the list to one account type — the split rows only ever pick a person. */
  filterType?: AccountType;
  /**
   * Offers a "+ New person" row that creates the account inline (name only, opening
   * balance zero) and picks it — a split is usually the first time a flatmate's
   * account is needed, and a detour through Manage accounts would lose the amount
   * already typed on the form behind this sheet.
   */
  allowCreate?: boolean;
};

const AccountPickerSheet = forwardRef<BottomSheetModal, Props>((
  { selectedId, title = "Pay from", onPick, onClear, filterType, allowCreate },
  ref
) => {
  // Own handle, so `dismiss` closes *this* picker. `useBottomSheetModal().dismiss()`
  // targets the top of the provider-wide queue instead, which — while this picker
  // sits over the form that opened it — is not reliably the caller.
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const dismiss = () => innerRef.current?.dismiss();

  const allAccounts = useAccounts();
  const accounts = filterType ? allAccounts.filter((a) => a.type === filterType) : allAccounts;
  usePrivacyMask(); // subscribe: a peek has to re-render the balances listed below
  const offline = useConnectivity((s) => s.offline);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const reset = () => {
    setCreating(false);
    setNewName("");
    setCreateError(null);
  };

  const onCreate = async () => {
    const trimmed = newName.trim();
    if (trimmed.length === 0) {
      haptics.error();
      setCreateError("Give them a name.");
      return;
    }
    setCreatingBusy(true);
    setCreateError(null);
    try {
      const created = await createAccount({ name: trimmed, type: "person", startingBalance: 0 });
      haptics.select();
      onPick(created._id);
      dismiss();
    }
    catch (err) {
      haptics.error();
      setCreateError(err instanceof Error ? err.message : "Couldn't add them");
    }
    finally {
      setCreatingBusy(false);
    }
  };

  return (
    <AppSheet ref={innerRef} onDismiss={reset}>
      <AppText size="md" weight="black">
        {title}
      </AppText>
      {allowCreate && creating && (
        <View style={styles.createRow}>
          <BottomSheetTextInput
            placeholder="Their name"
            placeholderTextColor={colors.gray400}
            value={newName}
            onChangeText={setNewName}
            returnKeyType="done"
            autoFocus
            inputAccessoryViewID={KEYBOARD_DONE_ID}
            style={styles.createInput}
          />
          {createError && (
            <AppText size="xs" color="danger">{createError}</AppText>
          )}
          <View style={styles.createActions}>
            <Button label="Add" onPress={onCreate} loading={creatingBusy} size="sm" />
            <Button label="Cancel" variant="ghost" size="sm" onPress={() => setCreating(false)} />
          </View>
        </View>
      )}
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
                  {account.type === "person" ? owedLine(account.balance) : `${formatMoney(account.balance)} available`}
                </AppText>
              </View>
              {selected && <Icon name="budgetOk" size={20} color="success" />}
            </PressableScale>
          );
        })}
        {allowCreate && !creating && (
          <PressableScale
            style={[styles.row, offline && styles.rowDim]}
            scaleTo={0.98}
            haptic={false}
            onPress={() => {
              // The picker itself works fully offline (it's a cached list) — only
              // creating someone new needs the server.
              if (offline) {
                toast.info("Adding a person needs a connection");
                return;
              }
              haptics.select();
              setCreating(true);
            }}
          >
            <Icon
              name={offline ? "lock" : "add"}
              size={20}
              containerSize={44}
              container="square"
              containerColor="surface2"
              color="inkDim"
            />
            <AppText size="sm" weight="bold" style={styles.info}>
              New person
            </AppText>
          </PressableScale>
        )}
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
  rowDim: {
    opacity: 0.55,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  createRow: {
    gap: spacing.sm,
  },
  createInput: {
    borderWidth: 1,
    borderRadius: 16,
    borderColor: "rgba(255,255,255,0.13)",
    backgroundColor: "rgba(255,255,255,0.07)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.ink,
    fontWeight: "600",
  },
  createActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
});

export default AccountPickerSheet;
