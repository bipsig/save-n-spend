// The account-type groups every figure reads (gaps row 7). Net worth counts every live
// account of any type, so it needs no list.

import { OWN_TYPES as OWN, SPENDABLE_TYPES as SPENDABLE } from "../constants";

/** Defined in constants.ts; widened here because callers test any stored type against them. */
export const SPENDABLE_TYPES: readonly string[] = SPENDABLE;
export const OWN_TYPES: readonly string[] = OWN;

export const isSpendable = (type: string): boolean => SPENDABLE_TYPES.includes(type);

/** The spendable accounts' balances added up. */
export const liquidBalance = (accounts: { type: string; balance: number }[]): number =>
    accounts.reduce((sum, a) => sum + (isSpendable(a.type) ? a.balance : 0), 0);
