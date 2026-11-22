import type { AccountType, BillFrequency, CategoryKind, TransactionType, TripStatus } from "@save-n-spend/types";

// The values each enum may take, once: route schemas use `z.enum(X)`, models `enum: [...X]`.
// packages/types can't be loaded at runtime, so its unions stay; the checks below fail the
// typecheck when the two drift apart.

export const ACCOUNT_TYPES = ["bank", "credit_card", "cash", "wallet", "person", "investment"] as const;
export const TRANSACTION_TYPES = ["expense", "income", "transfer", "positiveAdjustment", "negativeAdjustment"] as const;
export const ADJUSTMENT_TYPES = ["positiveAdjustment", "negativeAdjustment"] as const;
/** The types a list or summary filter can ask for (adjustments are bookkeeping). */
export const LISTED_TYPES = ["expense", "income", "transfer"] as const;
export const PAYMENT_MODES = ["cash", "upi", "card", "transfer"] as const;
export const BILL_FREQUENCIES = ["monthly", "yearly"] as const;
export const CATEGORY_KINDS = ["expense", "income"] as const;
export const TRIP_STATUSES = ["active", "closed"] as const;
export const INVESTED_HOW = ["sip", "lump"] as const;
export const TRIP_SETTLE_DIRECTIONS = ["received", "paid"] as const;

/** Money that can pay a bill today. A card's balance is debt, and neither a holding nor a
 *  friend pays the rent. */
export const SPENDABLE_TYPES = ["bank", "cash", "wallet"] as const;
/** Your own accounts that money is paid from: the spendable ones and cards (a trip expense
 *  can go on a card). */
export const OWN_TYPES = [...SPENDABLE_TYPES, "credit_card"] as const;

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const same = <T extends true>(_: T) => _;
same<Same<(typeof ACCOUNT_TYPES)[number], AccountType>>(true);
same<Same<(typeof TRANSACTION_TYPES)[number], TransactionType>>(true);
same<Same<(typeof BILL_FREQUENCIES)[number], BillFrequency>>(true);
same<Same<(typeof CATEGORY_KINDS)[number], CategoryKind>>(true);
same<Same<(typeof TRIP_STATUSES)[number], TripStatus>>(true);
