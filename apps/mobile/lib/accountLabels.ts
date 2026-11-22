import type { AccountType } from "@save-n-spend/types";

// Account type words, once (gaps row 36). Pure, so it runs under node:test; lib/accounts.ts
// re-exports it.

/** "Bank account", not "Bank": alone it reads as the institution. */
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  bank: "Bank account",
  credit_card: "Credit card",
  cash: "Cash",
  wallet: "Wallet",
  person: "Person",
  investment: "Investment",
};

/** The line under an account's name in a list that prints the balance beside it (Net worth):
 *  the type, except a person, who gets the direction ("Owes you", "You owe", "Settled up"). */
export const accountSubline = (account: { type: AccountType; balance: number }): string => {
  if (account.type !== "person") return ACCOUNT_TYPE_LABEL[account.type];
  if (account.balance === 0) return "Settled up";
  return account.balance > 0 ? "Owes you" : "You owe";
};
