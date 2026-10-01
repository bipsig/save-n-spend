import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import Button from "@/components/ui/Button";
import { ACCOUNT_GROUPS, createAccount, owedLine, useAccounts } from "@/lib/accounts";
import { useConnectivity } from "@/store/connectivity";
import { toast } from "@/store/toast";
import { haptics } from "@/lib/haptics";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import type { IconName } from "@/lib/icons";
import type { AccountType, IAccount } from "@save-n-spend/types";
import type { ColorToken } from "@/theme";
import { colors, radius, spacing } from "@/theme";
import { KEYBOARD_DONE_ID } from "@/components/ui/KeyboardDoneBar";

/** Past this many rows, finding one by eye stops working and the list gets a search box. */
const SEARCH_FROM = 8;

const SNAP_POINTS = ["78%"];

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
  /** Leaves these types out — a "pay from" list has no business offering an investment. */
  excludeTypes?: AccountType[];
  /**
   * Offers a "+ New person" row that creates the account inline (name only, opening
   * balance zero) and picks it — a split is usually the first time a flatmate's
   * account is needed, and a detour through Manage accounts would lose the amount
   * already typed on the form behind this sheet.
   */
  allowCreate?: boolean;
};

const AccountPickerSheet = forwardRef<BottomSheetModal, Props>((
  { selectedId, title = "Pay from", onPick, onClear, filterType, excludeTypes, allowCreate },
  ref
) => {
  // Own handle, so `dismiss` closes *this* picker. `useBottomSheetModal().dismiss()`
  // targets the top of the provider-wide queue instead, which — while this picker
  // sits over the form that opened it — is not reliably the caller.
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const dismiss = () => innerRef.current?.dismiss();

  const allAccounts = useAccounts();
  usePrivacyMask(); // subscribe: a peek has to re-render the balances listed below
  const offline = useConnectivity((s) => s.offline);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const accounts = useMemo(
    () => (filterType ? allAccounts.filter((a) => a.type === filterType) : allAccounts)
      .filter((a) => !excludeTypes?.includes(a.type)),
    [allAccounts, filterType, excludeTypes],
  );

  // Searching is offered on the whole list, not per group, so a name found by typing can
  // come from anywhere. The threshold is measured before filtering — the box must not
  // disappear from under the term that is narrowing the list.
  const searchable = accounts.length > SEARCH_FROM;
  const term = search.trim().toLowerCase();

  const groups = useMemo(() => {
    const matching = term ? accounts.filter((a) => a.name.toLowerCase().includes(term)) : accounts;
    return ACCOUNT_GROUPS
      .map(({ label, types }) => {
        const rows = matching.filter((a) => types.includes(a.type));
        // Whoever there is still money between comes first: a trip leaves behind people who
        // are settled up, and those are exactly the rows nobody is looking for.
        if (types.includes("person")) {
          const open = rows.filter((a) => a.balance !== 0);
          const settled = rows.filter((a) => a.balance === 0);
          return { label, rows: [...open, ...settled], settledFrom: open.length };
        }
        return { label, rows, settledFrom: -1 };
      })
      .filter((g) => g.rows.length > 0);
  }, [accounts, term]);

  // One group needs no heading — the sheet's own title already says what the list is.
  const showHeadings = groups.length > 1;

  const reset = () => {
    setCreating(false);
    setNewName("");
    setCreateError(null);
    setSearch("");
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

  const accountRow = (account: IAccount) => {
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
  };

  return (
    <AppSheet
      ref={innerRef}
      onDismiss={reset}
      // Long lists scroll instead of running off the bottom of the sheet. A fixed height
      // only once there's a search box: filtering a dynamically sized sheet would resize it
      // on every keystroke, with the rows jumping under the finger.
      scrollable
      snapPoints={searchable ? SNAP_POINTS : undefined}
    >
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
      {searchable && !creating && (
        <View style={styles.searchBox}>
          <Icon name="search" size={18} color="gray500" />
          <BottomSheetTextInput
            placeholder="Search accounts and people"
            placeholderTextColor={colors.gray400}
            value={search}
            onChangeText={setSearch}
            returnKeyType="done"
            inputAccessoryViewID={KEYBOARD_DONE_ID}
            style={styles.searchInput}
          />
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
        {groups.map((group) => (
          <View key={group.label} style={styles.group}>
            {showHeadings && (
              <AppText size="xs" weight="bold" color="inkDim" style={styles.groupLabel}>
                {group.label.toUpperCase()}
              </AppText>
            )}
            {group.rows.map((account, i) => (
              <View key={account._id}>
                {/* Where the people with nothing outstanding begin. Counted rather than just
                    labelled — each row already says "Settled up" on its own. */}
                {i === group.settledFrom && i > 0 && (
                  <AppText size="xs" color="inkDim" style={styles.settledLabel}>
                    {`${group.rows.length - group.settledFrom} settled up`}
                  </AppText>
                )}
                {accountRow(account)}
              </View>
            ))}
          </View>
        ))}
        {term.length > 0 && groups.length === 0 && (
          <AppText size="sm" color="inkDim">
            {`Nothing matches “${search.trim()}”.`}
          </AppText>
        )}
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
              // Whatever was typed is almost certainly the name being looked for.
              setNewName(search.trim());
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
  group: {
    gap: spacing.sm,
  },
  groupLabel: {
    letterSpacing: 1.3,
    marginTop: spacing.xs,
  },
  settledLabel: {
    marginBottom: spacing.sm,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  searchInput: {
    flex: 1,
    color: colors.ink,
    fontSize: 15,
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
