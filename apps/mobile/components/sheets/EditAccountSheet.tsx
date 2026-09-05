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
import { createAccount, updateAccount } from "@/lib/accounts";
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
];

const iconForType = (type: AccountType): IconName =>
  TYPES.find((t) => t.key === type)?.icon ?? "wallet";

// Rupees typed by a human → integer paise, the only unit the API accepts.
const toPaise = (rupees: string): number | null => {
  const trimmed = rupees.trim();
  if (trimmed === "") return 0; // an unfilled opening balance means zero, not an error
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
};

// Spec §08 — New / Edit account (Tier-2). One sheet for both; `account === null`
// is the only branch, and it is the only time an opening balance can be set.
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

  useEffect(() => {
    setName(account?.name ?? "");
    setType(account?.type ?? "bank");
    setOpening("");
    setIcon((account?.icon as IconName) ?? "bank");
    setColor((account?.color as ColorToken) ?? "info");
    setError(null);
  }, [account]);

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
    setBusy(true);
    setError(null);
    try {
      if (editing) await updateAccount(account._id, { name: trimmed, type, icon, color });
      else await createAccount({ name: trimmed, type, startingBalance, icon, color });
      onSaved?.();
      dismiss();
      toast.success(editing ? `${trimmed} updated` : `${trimmed} added`);
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

      {/* Only at creation. The balance the API maintains is opening balance plus
          every transaction since, so editing this term later would silently
          restate every total — a wrong opening balance is fixed with a
          transaction, not by rewriting the starting point. */}
      {editing ? (
        <AppText size="xs" color="inkDim" style={styles.note}>
          The balance moves with your transactions, so it isn&apos;t edited here. To
          correct it, add a transaction for the difference.
        </AppText>
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
