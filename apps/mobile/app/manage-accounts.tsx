import { useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, { LinearTransition } from "react-native-reanimated";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { IAccount } from "@save-n-spend/types";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import ManageRow from "@/components/rows/ManageRow";
import ConfirmSheet from "@/components/sheets/ConfirmSheet";
import EditAccountSheet from "@/components/sheets/EditAccountSheet";
import { AppText } from "@/components/ui/AppText";
import Caps from "@/components/ui/Caps";
import PressableScale from "@/components/ui/PressableScale";
import DragList from "@/components/ui/DragList";
import EmptyState from "@/components/states/EmptyState";
import ScreenStates from "@/components/states/ScreenStates";
import { ACCOUNT_GROUPS, ACCOUNT_TYPE_LABEL, reorderAccounts, useAccounts } from "@/lib/accounts";
import { archiveNotice } from "@/lib/archiveNotice";
import { useBills } from "@/lib/bills";
import { mergeSectionOrder } from "@/lib/accountOrder";
import formatMoney, { formatBalance, usePrivacyMask } from "@/lib/money";
import { screenTitles } from "@/data/menu";
import { updatePrefs } from "@/lib/profile";
import { useOnlineGate } from "@/lib/onlineGate";
import { useStoreLoad } from "@/lib/useStoreLoad";
import { useAccountStore } from "@/store/accounts";
import { useSession } from "@/store/session";
import { toast } from "@/store/toast";
import { deleteTarget, deleteWithUndo } from "@/lib/undo";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { spacing } from "@/theme";

const ManageAccountsScreen = () => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below
  const accounts = useAccounts();
  const { items: bills } = useBills();
  const defaultAccountId = useSession((s) => s.user?.prefs.defaultAccount);

  const [editing, setEditing] = useState<IAccount | null>(null);
  const [pendingDelete, setPendingDelete] = useState<IAccount | null>(null);
  const [reordering, setReordering] = useState(false);
  // A held row and a scrolling screen are the same gesture, so the scroll gives way.
  const [dragging, setDragging] = useState(false);
  const [showSettled, setShowSettled] = useState(false);

  // Each kind under its own heading, keeping the user's order within it. A trip adds a person
  // account per friend, so without this the list a user came to edit their bank in is mostly
  // people — and the ones there's no money left between are the deadest weight of all, so
  // they're folded away behind a count until asked for. Reordering shows everyone: a row
  // that's hidden can't be dragged, and the positions sent must cover the whole list.
  const groups = useMemo(() => {
    const expanded = showSettled || reordering;
    return ACCOUNT_GROUPS
      .map(({ label, types }) => {
        const all = accounts.filter((a) => types.includes(a.type));
        const people = types.includes("person");
        const settled = people ? all.filter((a) => a.balance === 0) : [];
        const rows = people && !expanded ? all.filter((a) => a.balance !== 0) : all;
        const open = people ? all.length - settled.length : 0;
        return {
          label,
          rows,
          // The count of foldable rows, whether or not they are showing — the toggle has to
          // stay put once expanded, or there is no way back.
          hidden: settled.length,
          note: people
            ? `${all.length} · ${open > 0 ? `${open} open` : "all settled"}`
            : `${all.length} · ${formatMoney(all.reduce((sum, a) => sum + a.balance, 0))}`,
        };
      })
      // A group with nothing in it and nothing folded away has no heading to show.
      .filter((g) => g.rows.length > 0 || g.hidden > 0);
  }, [accounts, showSettled, reordering]);

  const editRef = useRef<BottomSheetModal>(null);
  const deleteRef = useRef<BottomSheetModal>(null);

  // The list lives in a store, not a query, so no write or focus rule refreshes it. Balances
  // move with every transaction, so a stale list here would show wrong money.
  const state = useStoreLoad(useAccountStore((s) => s.loaded), useAccountStore.getState().load, useAccountStore((s) => s.fetchedAt));
  const reorderGate = useOnlineGate("Reorder accounts");

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

  // One section at a time is dragged, but `order` is a position across the whole list — so the
  // other sections are sent too, in the order they're shown. Stored order then matches the
  // screen, rather than keeping a hidden arrangement the user can't see.
  const commitOrder = (label: string, ids: string[]) => {
    const whole = mergeSectionOrder(
      groups.map((g) => ({ label: g.label, ids: g.rows.map((a) => a._id) })),
      label,
      ids,
      accounts.map((a) => a._id),
    );
    void reorderAccounts(whole).catch((err) => toast.fromError(err, "Couldn't save that order"));
  };

  const deleteBody = pendingDelete ? archiveNotice(pendingDelete, bills, formatMoney, pendingDelete._id === defaultAccountId) : "";

  return (
    <ScreenScaffold
      scrollEnabled={!dragging}
      title={screenTitles.accounts}
      back
      // New is gone while reordering: the mode has one job, and the tick is what leaves it.
      actions={[
        ...(accounts.length >= 2
          ? [{
            kind: "reorder" as const,
            label: reordering ? "Finish reordering" : reorderGate.allowed ? "Reorder accounts" : "Reorder accounts, needs a connection",
            selected: reordering,
            disabled: !reordering && !reorderGate.allowed,
            onPress: () => setReordering((on) => !on),
          }]
          : []),
        ...(reordering ? [] : [{ kind: "new" as const, label: "New account", onPress: openNew }]),
      ]}
      states={state}
    >
      <ScreenStates state={state}>
        {accounts.length === 0 ? (
          <EmptyState
            icon="bank"
            title="No accounts yet"
            subtitle="Every transaction comes from an account — add the first one and the rest of the app has somewhere to point."
            actionLabel="New account"
            onAction={openNew}
          />
        ) : (
          // `layout` so a card shrinks into place when a row is archived, instead of
          // the list snapping up a row-height in one frame.
          <Animated.View layout={LinearTransition.duration(220)} style={styles.groups}>
            {groups.map((group) => (
              <View key={group.label} style={styles.section}>
                <View style={styles.sectionHead}>
                  <Caps header style={styles.caps}>{group.label}</Caps>
                  <AppText size="xs" color="inkDim" style={styles.note}>{group.note}</AppText>
                  {group.hidden > 0 && !reordering && (
                    <PressableScale onPress={() => setShowSettled((on) => !on)} scaleTo={0.95} hitSlop={8} accessibilityState={{ expanded: showSettled }}>
                      <AppText size="xs" weight="black" color="primary">
                        {showSettled ? "Hide settled" : `Show ${group.hidden} settled`}
                      </AppText>
                    </PressableScale>
                  )}
                </View>
                {group.rows.length > 0 && (
                <Card padded={false} style={styles.card}>
                  <DragList
                    items={group.rows}
                    keyOf={(account) => account._id}
                    enabled={reordering && reorderGate.allowed}
                    onReorder={(ids) => commitOrder(group.label, ids)}
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
                              (account.type === "person"
                                ? formatBalance(account.balance, account.type)
                                : `${ACCOUNT_TYPE_LABEL[account.type]} · ${formatBalance(account.balance, account.type)}`) +
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
                )}
              </View>
            ))}
          </Animated.View>
        )}
      </ScreenStates>

      <EditAccountSheet ref={editRef} account={editing} />

      <ConfirmSheet
        ref={deleteRef}
        icon="delete"
        title={`Delete ${pendingDelete?.name ?? "account"}?`}
        body={deleteBody}
        confirmLabel="Delete account"
        needsConnection
        onConfirm={() => {
          if (!pendingDelete) return;
          const name = pendingDelete.name;
          const wasDefault = pendingDelete._id === defaultAccountId;
          deleteWithUndo({
            ...deleteTarget.account(pendingDelete._id),
            label: name,
            // Says the second consequence out loud: losing the default is a change the
            // user didn't ask for, and they'd otherwise meet it at the next form.
            message: wasDefault ? `${name} archived — you have no default account now` : `${name} archived`,
            // Otherwise the preference would still name an archived account. Sent only once
            // the delete lands, so undoing the delete undoes losing the default too.
            ...(wasDefault ? { after: [{ method: "PATCH" as const, path: "/users/me", body: { prefs: { defaultAccount: null } } }] } : {}),
            afterDelete: wasDefault ? () => updatePrefs({ defaultAccount: null }) : undefined,
            reload: () => useAccountStore.getState().load(),
          });
        }}
      />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  groups: {
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  caps: {
    flexShrink: 0,
  },
  note: {
    flex: 1,
  },
  card: {
    paddingVertical: 2,
  },
});

export default ManageAccountsScreen;
