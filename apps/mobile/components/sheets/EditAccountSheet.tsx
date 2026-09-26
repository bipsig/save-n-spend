import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import type { AccountType, IAccount, InvestedHow } from "@save-n-spend/types";
import AppSheet from "./AppSheet";
import { AppText } from "@/components/ui/AppText";
import AmountHeroInput from "@/components/ui/AmountHeroInput";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import ColorPicker from "@/components/ui/ColorPicker";
import Icon from "@/components/ui/Icon";
import IconPicker from "@/components/ui/IconPicker";
import Input from "@/components/ui/Input";
import DateField from "@/components/ui/DateField";
import { createAccount, syncAccountBalance, updateAccount } from "@/lib/accounts";
import { formatTxnDate, startOfToday } from "@/lib/date";
import { updateInvestmentBasis, type InvestmentBasis } from "@/lib/investments";
import { haptics } from "@/lib/haptics";
import type { IconName } from "@/lib/icons";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { toast } from "@/store/toast";
import type { ColorToken } from "@/theme";
import { spacing } from "@/theme";

type Props = {
  /** The account being edited, or `null` to create a new one. */
  account: IAccount | null;
  /** Type to preselect when CREATING (ignored when editing) — e.g. the Investments hub
   *  opens this pre-set to "investment". */
  defaultType?: AccountType;
  /** Editing an investment: the total invested so far (paise), shown as what's recorded. */
  invested?: number;
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
  { key: "investment", label: "Investment", icon: "investments" },
];

// Preset grouping keys for an investment account. Free-text too — a kind not in this list
// is stored verbatim, so a new one never needs a code change (see `investmentKind`). Blank
// on save falls back to "Other" so the hub always has a group to file it under.
const INVESTMENT_KINDS = ["SIP", "Mutual Fund", "Stocks", "Fixed Deposit", "Recurring Deposit", "PPF", "NPS", "Gold", "Crypto"];

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
const EditAccountSheet = forwardRef<BottomSheetModal, Props>(({ account, defaultType, invested, onSaved }, ref) => {
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const dismiss = () => innerRef.current?.dismiss();
  const router = useRouter();

  const editing = account !== null;
  usePrivacyMask(); // subscribe: a peek has to reveal the balance printed below

  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("bank");
  const [investmentKind, setInvestmentKind] = useState("");
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

  // Investments. What it's worth today when that differs from what went in (blank = the
  // same), and when and how the money already in it went in — which dates it for the yearly
  // return. When editing, `investedInput` corrects the invested total (blank = keep).
  const [worth, setWorth] = useState("");
  const [investedInput, setInvestedInput] = useState("");
  const [startDate, setStartDate] = useState<Date>(startOfToday());
  const [how, setHow] = useState<InvestedHow>("sip");
  const [basisTouched, setBasisTouched] = useState(false);

  // Back to what this sheet was opened for — the account's own values, or a blank new one.
  // Run on dismiss too, not only when `account` changes: adding a second new account opens
  // on the same `null`, so a props-keyed reset alone would leave the first one's entries.
  const resetForm = useCallback(() => {
    const initialType = account?.type ?? defaultType ?? "bank";
    setName(account?.name ?? "");
    setType(initialType);
    setInvestmentKind(account?.investmentKind ?? "");
    setOpening("");
    setIcon((account?.icon as IconName) ?? iconForType(initialType));
    setColor((account?.color as ColorToken) ?? "info");
    setActual("");
    setNote("");
    // Seeded from where the balance sits, so a card normally owed opens on "Owed".
    setNegative((account?.balance ?? 0) < 0);
    setWorth("");
    setInvestedInput("");
    setStartDate(account?.investedSince ? new Date(account.investedSince) : startOfToday());
    setHow(account?.investedHow ?? "sip");
    setBasisTouched(false);
    setError(null);
  }, [account, defaultType]);

  useEffect(() => { resetForm(); }, [resetForm]);

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

  // Hands off to a prefilled transfer rather than composing one here — Add Transaction
  // already owns every account picker and the amount pad, and duplicating that machinery
  // in a sheet would be the one place it could drift from the real form.
  const settleUp = () => {
    if (!account) return;
    dismiss();
    router.push({ pathname: "/add-transaction", params: { settleAccount: account._id } });
  };

  const isInvestment = type === "investment";
  const openingPaise = toPaise(opening);
  const worthPaise = worth.trim() === "" ? null : toPaise(worth);
  const investedPaise = investedInput.trim() === "" ? null : toPaise(investedInput);
  // The invested total the preview measures against: a correction being typed, else what's
  // recorded. And the value: a new one being typed, else what's recorded.
  const basisNow = editing ? (investedPaise ?? invested ?? 0) : (openingPaise ?? 0);
  const valueNow = editing ? (typeof target === "number" ? target : account?.balance ?? 0) : (worthPaise ?? openingPaise ?? 0);
  const previewGain = valueNow - basisNow;
  // Start date and how only matter once there's money that went in before tracking began.
  const needsStart = isInvestment && (editing ? (investedPaise ?? account?.startingBalance ?? 0) > 0 || !!account?.investedSince : (openingPaise ?? 0) > 0);

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
    // `toPaise` answers null for a typo; a blank field is already null above and means "keep".
    if (isInvestment && ((worth.trim() !== "" && worthPaise === null) || (investedInput.trim() !== "" && investedPaise === null))) {
      haptics.error();
      setError("Enter amounts as numbers, or leave them blank.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Blank kind on an investment falls back to "Other" so the hub always has a group.
      const kind = type === "investment" ? (investmentKind.trim() || "Other") : undefined;
      if (editing) {
        await updateAccount(account._id, { name: trimmed, type, icon, color, investmentKind: kind });
        if (isInvestment) {
          const basis: InvestmentBasis = {};
          if (investedPaise !== null) basis.invested = investedPaise;
          if (basisTouched && needsStart) {
            basis.investedSince = startDate.toISOString();
            basis.investedHow = how;
          }
          if (Object.keys(basis).length > 0) await updateInvestmentBasis(account._id, basis);
        }
        // A second call, skipped when the field was blank, so renaming an account never
        // sends anything that could move money. The server records the difference as an
        // adjustment; see `syncAccountBalance`.
        if (target !== null) {
          await syncAccountBalance(account._id, target, note.trim() || undefined);
        }
      }
      else {
        await createAccount({
          name: trimmed,
          type,
          startingBalance,
          icon,
          color,
          investmentKind: kind,
          ...(isInvestment && worthPaise !== null ? { currentValue: worthPaise } : {}),
          ...(isInvestment && startingBalance > 0 ? { investedSince: startDate.toISOString(), investedHow: how } : {}),
        });
      }
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
      onDismiss={resetForm}
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

      {/* The common case for a person account — settling is far more frequent than
          correcting a typo, so it leads rather than sitting inside "UPDATE BALANCE"
          below. Hidden once there's nothing left to settle. */}
      {editing && type === "person" && account.balance !== 0 && (
        <Button
          label={account.balance > 0 ? `Settle up · owes you ${formatMoney(account.balance)}` : `Settle up · you owe ${formatMoney(-account.balance)}`}
          variant="secondary"
          icon="transfer"
          onPress={settleUp}
        />
      )}

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
        {editing ? (
          // Fixed once created — changing it would silently recategorise the account and
          // its history (e.g. an investment dropping out of the Investments hub). Reclassify
          // by deleting and recreating instead.
          <>
            <View style={styles.types}>
              <Chip label={TYPES.find((t) => t.key === type)?.label ?? type} selected disabled />
            </View>
            <AppText size="xs" color="inkDim" style={styles.note}>
              Set when the account was created and can&apos;t be changed.
            </AppText>
          </>
        ) : (
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
        )}
      </View>

      {/* Only for an investment — the grouping key on the hub. Presets as chips, plus a
          free-text field so an unlisted kind is kept verbatim. */}
      {type === "investment" && (
        <View style={styles.field}>
          <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>
            KIND
          </AppText>
          <View style={styles.types}>
            {INVESTMENT_KINDS.map((k) => (
              <Chip
                key={k}
                label={k}
                selected={investmentKind.trim() === k}
                onPress={() => setInvestmentKind(k)}
              />
            ))}
          </View>
          <Input
            label="Or type your own"
            placeholder="e.g. ELSS"
            value={investmentKind}
            onChangeText={setInvestmentKind}
            autoCapitalize="words"
            InputComponent={BottomSheetTextInput}
          />
        </View>
      )}

      {/* Two different fields wearing the same shape. At creation this is the opening
          balance — a term the running total is built from, which is why it can never be
          edited again. When editing it is a reconciliation: the user reads a figure off
          their banking app, and the server records the gap as an adjustment rather than
          overwriting a number that is supposed to be the sum of its history. */}
      {editing && isInvestment ? (
        <>
          <View style={styles.field}>
            <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>INVESTED SO FAR</AppText>
            <AmountHeroInput value={investedInput} onChangeText={setInvestedInput} />
            <AppText size="xs" color="inkDim" style={styles.note}>
              We have {formatMoney(invested ?? 0)} recorded as invested. Enter the real total to correct it — this changes your gain, not what it&apos;s worth. Leave blank to keep it.
            </AppText>
          </View>
          <View style={styles.field}>
            <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>WORTH TODAY</AppText>
            <AmountHeroInput value={actual} onChangeText={setActual} />
            <AppText size="xs" color="inkDim" style={styles.note}>
              Recorded as {formatMoney(account.balance)}. Leave blank to keep it.
            </AppText>
          </View>
          <GainPreview gain={previewGain} basis={basisNow} show={investedPaise !== null || typeof target === "number"} />
          {needsStart && (
            <StartFields
              date={startDate}
              how={how}
              onDate={(d) => { setStartDate(d); setBasisTouched(true); }}
              onHow={(h) => { setHow(h); setBasisTouched(true); }}
            />
          )}
        </>
      ) : editing ? (
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
      ) : isInvestment ? (
        <>
          <View style={styles.field}>
            <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>INVESTED SO FAR</AppText>
            <AmountHeroInput value={opening} onChangeText={setOpening} />
            <AppText size="xs" color="inkDim" style={styles.note}>
              What you&apos;ve put in until now. Leave blank if you&apos;re just starting.
            </AppText>
          </View>
          {(openingPaise ?? 0) > 0 && (
            <>
              <View style={styles.field}>
                <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>WORTH TODAY</AppText>
                <AmountHeroInput value={worth} onChangeText={setWorth} />
                <AppText size="xs" color="inkDim" style={styles.note}>
                  What it&apos;s worth right now. Leave blank if it&apos;s the same as what you put in.
                </AppText>
              </View>
              <GainPreview gain={previewGain} basis={basisNow} show={worthPaise !== null} />
              <StartFields date={startDate} how={how} onDate={setStartDate} onHow={setHow} />
            </>
          )}
        </>
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

// "▼ ₹10,000 (−10%) so far" — what the two figures imply, before saving.
const GainPreview = ({ gain, basis, show }: { gain: number; basis: number; show: boolean }) => {
  if (!show) return null;
  const pct = basis > 0 ? (gain / basis) * 100 : null;
  return (
    <AppText size="xs" weight="bold" color={gain > 0 ? "success" : gain < 0 ? "danger" : "inkDim"}>
      {gain === 0
        ? "No gain or loss so far"
        : `${gain > 0 ? "▲" : "▼"} ${formatMoney(Math.abs(gain))}${pct !== null ? ` (${gain > 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%)` : ""} so far`}
    </AppText>
  );
};

// When the money already in it started going in, and how — which is what dates it for the
// yearly return. A SIP's amount is spread monthly from the start date; a lump sits on it.
const StartFields = ({ date, how, onDate, onHow }: {
  date: Date;
  how: InvestedHow;
  onDate: (d: Date) => void;
  onHow: (h: InvestedHow) => void;
}) => (
  <View style={styles.field}>
    <DateField label="STARTED" value={date} onChange={onDate} maximumDate={new Date()} />
    <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>HOW</AppText>
    <View style={styles.types}>
      <Chip label="Monthly SIP" selected={how === "sip"} onPress={() => onHow("sip")} />
      <Chip label="Lump sum" selected={how === "lump"} onPress={() => onHow("lump")} />
    </View>
    <AppText size="xs" color="inkDim" style={styles.note}>
      {how === "sip"
        ? "Spread evenly month by month from the start date — so your yearly return counts each instalment only for the time it was invested."
        : "All of it went in on the start date."}
    </AppText>
  </View>
);

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
