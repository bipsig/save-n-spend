import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import type { AccountType, IAccount } from "@save-n-spend/types";
import AppSheet from "./AppSheet";
import { AppText } from "@/components/ui/AppText";
import AmountHeroInput from "@/components/ui/AmountHeroInput";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import ColorPicker from "@/components/ui/ColorPicker";
import Icon from "@/components/ui/Icon";
import IconPicker from "@/components/ui/IconPicker";
import Input from "@/components/ui/Input";
import { createAccount, syncAccountBalance, updateAccount } from "@/lib/accounts";
import { formatTxnDate } from "@/lib/date";
import { haptics } from "@/lib/haptics";
import type { IconName } from "@/lib/icons";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { toast } from "@/store/toast";
import type { ColorToken } from "@/theme";
import { spacing } from "@/theme";

type Props = {
  /** The account being edited, or `null` to create a new one. */
  account: IAccount | null;
  onSaved?: () => void;
};

// Each type gets a default glyph, so a new account looks right before the icon
// picker is touched at all.
const TYPES: { key: AccountType; label: string; icon: IconName }[] = [
  { key: "bank", label: "Bank", icon: "bank" },
  { key: "credit_card", label: "Credit card", icon: "card" },
  { key: "cash", label: "Cash", icon: "payments" },
  { key: "wallet", label: "Wallet", icon: "wallet" },
  { key: "person", label: "Person", icon: "person" },
];

const iconForType = (type: AccountType): IconName =>
  TYPES.find((t) => t.key === type)?.icon ?? "wallet";

// Only these can hold less than nothing — an overdraft, a card balance owed, and a person
// the user owes. Offering cash or a wallet a sign would be a switch that makes the figure wrong.
const CAN_GO_NEGATIVE: AccountType[] = ["bank", "credit_card", "person"];

const SIGN_LABELS: Partial<Record<AccountType, { positive: string; negative: string }>> = {
  bank: { positive: "In account", negative: "Overdrawn" },
  credit_card: { positive: "In credit", negative: "Owed" },
  person: { positive: "Owes you", negative: "You owe" },
};

// Rupees typed by a human → integer paise, the only unit the API accepts.
const toPaise = (rupees: string): number | null => {
  const trimmed = rupees.trim();
  if (trimmed === "") return 0; // an unfilled opening balance means zero, not an error
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
};

// Spec §08 — New / Edit account (Tier-2). One sheet for both; `account === null` is the only
// branch. Creating sets an opening balance, which can never be edited again; editing offers
// a reconciliation against the bank instead, through a different endpoint.
const EditAccountSheet = forwardRef<BottomSheetModal, Props>(({ account, onSaved }, ref) => {
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const dismiss = () => innerRef.current?.dismiss();

  const editing = account !== null;
  usePrivacyMask(); // subscribe: a peek has to reveal the balance printed below

  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("bank");
  const [opening, setOpening] = useState("");
  const [icon, setIcon] = useState<IconName>("bank");
  const [color, setColor] = useState<ColorToken>("info");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The balance correction, when editing. NOT prefilled: a prefill prints a real figure
  // into a text field privacy mode cannot mask, and makes "I didn't touch this"
  // indistinguishable from "set it to what it already was". Blank leaves the balance alone.
  // Magnitude and sign are separate because `decimal-pad` has no minus key.
  const [actual, setActual] = useState("");
  const [negative, setNegative] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    setName(account?.name ?? "");
    setType(account?.type ?? "bank");
    setOpening("");
    setIcon((account?.icon as IconName) ?? "bank");
    setColor((account?.color as ColorToken) ?? "info");
    setActual("");
    setNote("");
    // Seeded from where the balance sits, so a card normally owed opens on "Owed".
    setNegative((account?.balance ?? 0) < 0);
    setError(null);
  }, [account]);

  // The correction about to be made, or `null` when there is nothing to do. `undefined`
  // marks an unparseable figure, so the save path refuses it rather than reading a typo as
  // "no change".
  const target = (() => {
    if (!editing || actual.trim() === "") return null;
    const magnitude = toPaise(actual);
    if (magnitude === null) return undefined;
    return negative && CAN_GO_NEGATIVE.includes(type) ? -magnitude : magnitude;
  })();
  const delta = typeof target === "number" && account ? target - account.balance : 0;

  // Changing the type on a new account also moves its glyph, unless the icon has
  // already been picked away from the previous type's default.
  const pickType = (next: AccountType) => {
    setType(next);
    if (icon === iconForType(type)) setIcon(iconForType(next));
  };

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      haptics.error();
      setError("Give the account a name of at least two characters.");
      return;
    }
    const startingBalance = toPaise(opening);
    if (startingBalance === null) {
      haptics.error();
      setError("Enter the opening balance as a number, or leave it blank for zero.");
      return;
    }
    if (target === undefined) {
      haptics.error();
      setError("Enter the balance as a number, or leave it blank to keep the one you have.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await updateAccount(account._id, { name: trimmed, type, icon, color });
        // A second call, skipped when the field was blank, so renaming an account never
        // sends anything that could move money. The server records the difference as an
        // adjustment; see `syncAccountBalance`.
        if (target !== null) {
          await syncAccountBalance(account._id, target, note.trim() || undefined);
        }
      }
      else await createAccount({ name: trimmed, type, startingBalance, icon, color });
      onSaved?.();
      dismiss();
      // Names the correction when there was one — the bigger of the two things that just
      // happened, which a bare "updated" would hide.
      if (editing && delta !== 0) toast.success(`${trimmed} balance updated`);
      else toast.success(editing ? `${trimmed} updated` : `${trimmed} added`);
    }
    catch (err) {
      haptics.error();
      setError(err instanceof Error ? err.message : "Couldn't save the account. Try again.");
    }
    finally {
      setBusy(false);
    }
  };

  return (
    <AppSheet
      ref={innerRef}
      scrollable
      snapPoints={["82%"]}
      onDismiss={() => setError(null)}
      footer={
        <Button
          label={editing ? "Save changes" : "Create account"}
          loading={busy}
          onPress={save}
        />
      }
    >
      <View style={styles.identity}>
        <Icon name={icon} size={24} containerSize={52} container="square" gradient={color} />
        <View style={styles.identityText}>
          <AppText size="md" weight="black" numberOfLines={1}>
            {name.trim() || (editing ? "Edit account" : "New account")}
          </AppText>
          <AppText size="xs" color="inkDim">
            {/* `formatMoney`, not the exact formatter this used to call: privacy mode
                has to hold inside a sheet too, or the one screen showing a real
                balance would be the one the user opened by accident in public. */}
            {editing ? `Balance ${formatMoney(account.balance)}` : "Where money sits or is owed"}
          </AppText>
        </View>
      </View>

      <Input
        label="Name"
        placeholder="e.g. HDFC Savings"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        InputComponent={BottomSheetTextInput}
      />

      <View style={styles.field}>
        <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>
          TYPE
        </AppText>
        <View style={styles.types}>
          {TYPES.map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              selected={type === option.key}
              onPress={() => pickType(option.key)}
            />
          ))}
        </View>
      </View>

      {/* Two different fields wearing the same shape. At creation this is the opening
          balance — a term the running total is built from, which is why it can never be
          edited again. When editing it is a reconciliation: the user reads a figure off
          their banking app, and the server records the gap as an adjustment rather than
          overwriting a number that is supposed to be the sum of its history. */}
      {editing ? (
        <View style={styles.field}>
          <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>
            UPDATE BALANCE
          </AppText>

          {CAN_GO_NEGATIVE.includes(type) && (
            <View style={styles.types}>
              <Chip
                label={SIGN_LABELS[type]?.positive ?? "Positive"}
                selected={!negative}
                onPress={() => setNegative(false)}
              />
              <Chip
                label={SIGN_LABELS[type]?.negative ?? "Negative"}
                selected={negative}
                onPress={() => setNegative(true)}
              />
            </View>
          )}

          <AmountHeroInput value={actual} onChangeText={setActual} />

          <AppText size="xs" color="inkDim" style={styles.note}>
            {/* The recorded figure goes through `formatMoney`, so privacy mode still
                holds — which is also why the field above starts blank rather than
                prefilled with it. */}
            We have {formatMoney(account.balance)} recorded. Enter what your bank shows
            and we&apos;ll square the difference. Leave it blank to keep what you have.
          </AppText>

          {/* Says what the correction will do before it is made — the whole safety of
              typing a balance in by hand is seeing the gap it implies first. */}
          {delta !== 0 && (
            <AppText size="xs" weight="bold" color={delta > 0 ? "success" : "danger"}>
              {delta > 0 ? "Adds " : "Removes "}
              {formatMoney(Math.abs(delta))} to match
            </AppText>
          )}
          {target !== null && delta === 0 && (
            <AppText size="xs" color="inkDim">
              That already matches — nothing to correct.
            </AppText>
          )}

          {delta !== 0 && (
            <Input
              label="Reason (optional)"
              placeholder="e.g. Interest credited"
              value={note}
              onChangeText={setNote}
              InputComponent={BottomSheetTextInput}
            />
          )}

          <AppText size="xs" color="inkDim" style={styles.note}>
            {account.lastSyncedAt
              ? `Last checked ${formatTxnDate(account.lastSyncedAt)}.`
              : "You haven't checked this against your bank yet."}
          </AppText>
        </View>
      ) : (
        <View style={styles.field}>
          <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>
            OPENING BALANCE
          </AppText>
          <AmountHeroInput value={opening} onChangeText={setOpening} />
          <AppText size="xs" color="inkDim" style={styles.note}>
            What&apos;s in the account today. Leave blank for zero.
          </AppText>
        </View>
      )}

      <View style={styles.field}>
        <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>
          ICON
        </AppText>
        <IconPicker value={icon} onChange={setIcon} />
      </View>

      <View style={styles.field}>
        <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>
          COLOUR
        </AppText>
        <ColorPicker value={color} onChange={setColor} />
      </View>

      {error && (
        <AppText size="sm" color="danger">
          {error}
        </AppText>
      )}
    </AppSheet>
  );
});

EditAccountSheet.displayName = "EditAccountSheet";

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
  field: {
    gap: spacing.sm,
  },
  // spec .flabel — tiny caps, wide tracking
  fieldLabel: {
    letterSpacing: 1.3,
  },
  types: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  note: {
    lineHeight: 17,
  },
});

export default EditAccountSheet;
