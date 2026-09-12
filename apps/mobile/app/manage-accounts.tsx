import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, { LinearTransition } from "react-native-reanimated";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { AccountType, IAccount } from "@save-n-spend/types";
import BackButton from "@/components/shell/BackButton";
import PeekButton from "@/components/shell/PeekButton";
import ReorderToggle from "@/components/shell/ReorderToggle";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import ManageRow from "@/components/rows/ManageRow";
import ConfirmSheet from "@/components/sheets/ConfirmSheet";
import EditAccountSheet from "@/components/sheets/EditAccountSheet";
import { AppText } from "@/components/ui/AppText";
import Button from "@/components/ui/Button";
import DragList from "@/components/ui/DragList";
import EmptyState from "@/components/states/EmptyState";
import { archiveAccount, reorderAccounts, useAccounts } from "@/lib/accounts";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { updatePrefs } from "@/lib/profile";
import { useAccountStore } from "@/store/accounts";
import { useSession } from "@/store/session";
import { toast } from "@/store/toast";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { spacing } from "@/theme";

const TYPE_LABELS: Record<AccountType, string> = {
  bank: "Bank",
  credit_card: "Credit card",
  cash: "Cash",
  wallet: "Wallet",
  person: "Person",
};

const ManageAccountsScreen = () => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below
  const accounts = useAccounts();
  const defaultAccountId = useSession((s) => s.user?.prefs.defaultAccount);

  const [editing, setEditing] = useState<IAccount | null>(null);
  const [pendingDelete, setPendingDelete] = useState<IAccount | null>(null);
  const [reordering, setReordering] = useState(false);
  // A held row and a scrolling screen are the same gesture, so the scroll gives way.
  const [dragging, setDragging] = useState(false);

  const editRef = useRef<BottomSheetModal>(null);
  const deleteRef = useRef<BottomSheetModal>(null);

  // Balances move with every transaction, so a stale list here would show wrong
  // money — refetch on focus like every other data screen.
  useFocusEffect(
    useCallback(() => {
      void useAccountStore.getState().load();
    }, [])
  );

  const openNew = () => {
    setEditing(null);
    editRef.current?.present();
  };

  const openEdit = (account: IAccount) => {
    setEditing(account);
    editRef.current?.present();
  };

  const openDelete = (account: IAccount) => {
    setPendingDelete(account);
    deleteRef.current?.present();
  };

  // Sends the whole list, since `order` is a position rather than a rank. The store moves
  // first, so the row is already in its new place by the time the request goes out.
  const commitOrder = (ids: string[]) => {
    void reorderAccounts(ids).catch((err) => toast.fromError(err, "Couldn't save that order"));
  };

  const deleteBody = pendingDelete
    ? `It disappears from your pickers, and its ${formatMoney(pendingDelete.balance)} stops counting toward your totals. Transactions already recorded against it keep their history.`
    : "";

  return (
    <ScreenScaffold
      scrollEnabled={!dragging}
      header={
        <View style={styles.head}>
          <BackButton />
          <AppText size="xl" weight="black" style={styles.headTitle}>
            Accounts
          </AppText>
          <PeekButton />
          <ReorderToggle
            active={reordering}
            onPress={() => setReordering((on) => !on)}
            disabled={accounts.length < 2}
          />
          {/* Gone while reordering: the mode has one job, and the header has no room for
              a second action beside the tick that leaves it. */}
          {!reordering && <Button label="New" icon="add" pill onPress={openNew} />}
        </View>
      }
    >
      {accounts.length === 0 ? (
        <EmptyState
          icon="bank"
          title="No accounts yet"
          subtitle="Every transaction comes from an account — add the first one and the rest of the app has somewhere to point."
          actionLabel="New account"
          onAction={openNew}
        />
      ) : (
        // `layout` so the card shrinks into place when a row is archived, instead of
        // the list snapping up a row-height in one frame.
        <Animated.View layout={LinearTransition.duration(220)}>
          <Card padded={false} style={styles.group}>
            <DragList
              items={accounts}
              keyOf={(account) => account._id}
              enabled={reordering}
              onReorder={commitOrder}
              onDragChange={setDragging}
              render={(account, i, { dragging: held, gesture }) => (
                <GestureDetector gesture={gesture}>
                  <View>
                    <ManageRow
                      first={i === 0}
                      icon={(account.icon ?? "wallet") as IconName}
                      color={(account.color ?? "info") as ColorToken}
                      label={account.name}
                      sub={
                        `${TYPE_LABELS[account.type]} · ${formatMoney(account.balance)}` +
                        (account._id === defaultAccountId ? " · Default" : "")
                      }
                      onEdit={() => openEdit(account)}
                      onDelete={() => openDelete(account)}
                      reordering={reordering}
                      dragging={held}
                    />
                  </View>
                </GestureDetector>
              )}
            />
          </Card>
        </Animated.View>
      )}

      <EditAccountSheet ref={editRef} account={editing} />

      <ConfirmSheet
        ref={deleteRef}
        icon="delete"
        title={`Delete ${pendingDelete?.name ?? "account"}?`}
        body={deleteBody}
        confirmLabel="Delete account"
        onConfirm={async () => {
          if (!pendingDelete) return;
          await archiveAccount(pendingDelete._id);
          // Otherwise the preference would still name an archived account, and
          // every form that preselects it would silently fall back to nothing.
          const wasDefault = pendingDelete._id === defaultAccountId;
          if (wasDefault) await updatePrefs({ defaultAccount: null });
          // Says the second consequence out loud: losing the default is a change the
          // user didn't ask for, and they'd otherwise meet it at the next form.
          toast.success(
            wasDefault
              ? `${pendingDelete.name} archived — you have no default account now`
              : `${pendingDelete.name} archived`
          );
        }}
      />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headTitle: {
    flex: 1,
  },
  group: {
    paddingVertical: 2,
  },
});

export default ManageAccountsScreen;
