import type { AccountType } from "@save-n-spend/types";

// Pure money formatting: no store, no masking. Screens use the masked wrappers in lib/money.ts;
// these are for files the user asked for and for the wrappers themselves.

/** U+2212. As wide as "+", so signed figures line up. CSV files keep "-" for spreadsheets. */
export const MINUS = "\u2212";

/** What every amount reads as while privacy mode masks it, at one width whatever the figure. */
export const MASKED_MONEY = "₹ ••••";

/**
 * - `auto`: "−" on a negative, nothing on a positive.
 * - `always`: "+" on a positive too, for changes and income rows.
 * - `none`: the magnitude only, for figures whose label already names the direction.
 *
 * A figure that rounds to zero never carries a sign.
 */
export type Sign = "auto" | "always" | "none";

export type MoneyOptions = { sign?: Sign };

export const signFor = (value: number, sign: Sign = "auto"): string => {
  if (value === 0 || sign === "none") return "";
  if (value < 0) return MINUS;
  return sign === "always" ? "+" : "";
};

/** Indian digit grouping of a whole number: 1234567 -> "12,34,567". */
export const groupIndian = (whole: number): string => {
  const digits = String(Math.abs(Math.trunc(whole)));
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, -3).replace(/\B(?=(\d{2})+$)/g, ",");
  return `${head},${digits.slice(-3)}`;
};

/** Integer paise as exact rupees, always two decimals: 5240000 -> "₹52,400.00", -45000 -> "−₹450.00". */
export const formatMoneyExact = (paise: number, { sign = "auto" }: MoneyOptions = {}): string => {
  const rounded = Math.round(paise);
  const abs = Math.abs(rounded);
  const body = `₹${groupIndian(Math.floor(abs / 100))}.${String(abs % 100).padStart(2, "0")}`;
  return `${signFor(rounded, sign)}${body}`;
};

/** The word after a balance whose label names its direction: a card is "owed", a bank
 *  "overdrawn" (D11 A). Person accounts are worded in `formatBalance` (lib/money.ts). */
export const balanceWord = (balance: number, type: AccountType): "available" | "owed" | "overdrawn" => {
  if (Math.round(balance) >= 0) return "available";
  return type === "credit_card" ? "owed" : "overdrawn";
};

/** A budget's remaining money: "left" while there is some, "over" once spent past it. */
export const remainingWord = (remaining: number): "left" | "over" =>
  Math.round(remaining) < 0 ? "over" : "left";
