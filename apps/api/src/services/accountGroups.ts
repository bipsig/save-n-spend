// The account-type groups every figure reads (gaps row 7). Net worth counts every live
// account of any type, so it needs no list.

/** Money that can pay a bill today. A card's balance is debt, and neither a holding nor a
 *  friend pays the rent. */
export const SPENDABLE_TYPES: readonly string[] = ["bank", "cash", "wallet"];

/** Your own accounts that money is paid from: the spendable ones and cards (a trip expense
 *  can go on a card). */
export const OWN_TYPES: readonly string[] = [...SPENDABLE_TYPES, "credit_card"];

export const isSpendable = (type: string): boolean => SPENDABLE_TYPES.includes(type);

/** The spendable accounts' balances added up. */
export const liquidBalance = (accounts: { type: string; balance: number }[]): number =>
    accounts.reduce((sum, a) => sum + (isSpendable(a.type) ? a.balance : 0), 0);
