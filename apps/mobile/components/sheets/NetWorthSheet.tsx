import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { AccountType, IAccount } from "@save-n-spend/types";
import AppSheet from "./AppSheet";
import { AppText } from "@/components/ui/AppText";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import Money from "@/components/ui/Money";
import { useAccounts } from "@/lib/accounts";
import { usePrivacyMask } from "@/lib/money";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { spacing } from "@/theme";

const TYPE_LABEL: Record<AccountType, string> = {
  bank: "Bank account",
  credit_card: "Credit card",
  cash: "Cash",
  wallet: "Wallet",
};

// Biggest holding first, which also drops anything owed (a used credit card carries a
// negative balance) to the bottom — the order the total is read in.
const byBalance = (a: IAccount, b: IAccount) => b.balance - a.balance;

type Props = {
  /** The dashboard tile's figure, passed in so the two can't disagree on rounding. */
  netWorth: number;
};

// What the Net Worth tile is made of. The server sums the balance of every account that
// isn't archived (dashboardController), so these rows add up to the figure above them —
// which is the whole reason the sheet exists rather than a link to Manage accounts.
const NetWorthSheet = forwardRef<BottomSheetModal, Props>(({ netWorth }, ref) => {
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const dismiss = () => innerRef.current?.dismiss();

  const accounts = useAccounts();
  usePrivacyMask(); // subscribe: a peek has to re-render the balances listed below

  const owed = accounts.some((a) => a.balance < 0);

  return (
    <AppSheet ref={innerRef} scrollable>
      <View style={styles.head}>
        <AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>
          NET WORTH
        </AppText>
        <Money value={netWorth} size="2xl" weight="black" />
        <AppText size="xs" color="inkDim">
          {accounts.length === 1
            ? "Across your one account, as it stands now."
            : `Across your ${accounts.length} accounts, as it stands now.`}
        </AppText>
      </View>

      <View style={styles.list}>
        {[...accounts].sort(byBalance).map((account) => (
          <View key={account._id} style={styles.row}>
            <Icon
              name={(account.icon ?? "wallet") as IconName}
              size={20}
              containerSize={44}
              container="square"
              gradient={(account.color ?? "accent") as ColorToken}
            />
            <View style={styles.info}>
              <AppText size="sm" weight="bold" numberOfLines={1}>
                {account.name}
              </AppText>
              <AppText size="xs" color="inkDim">
                {TYPE_LABEL[account.type]}
              </AppText>
            </View>
            {/* Red only when the account is in the red: a negative balance is money owed,
                and it subtracts from the total above rather than adding to it. */}
            <Money
              value={account.balance}
              size="md"
              weight="black"
              align="right"
              color={account.balance < 0 ? "danger" : undefined}
            />
          </View>
        ))}
      </View>

      {/* Only said when there is something owed to explain — otherwise it is a rule about
          a case the user doesn't have. */}
      {owed && (
        <AppText size="xs" color="inkDim" style={styles.note}>
          An account in red is money you owe, so it comes off the total rather than adding
          to it.
        </AppText>
      )}

      <Button
        label="Manage accounts"
        variant="ghost"
        onPress={() => {
          dismiss();
          router.push("/manage-accounts");
        }}
      />
    </AppSheet>
  );
});

NetWorthSheet.displayName = "NetWorthSheet";

const styles = StyleSheet.create({
  head: {
    gap: 4,
  },
  caps: {
    letterSpacing: 1.3,
  },
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
  info: {
    flex: 1,
    gap: 2,
  },
  note: {
    lineHeight: 17,
  },
});

export default NetWorthSheet;
