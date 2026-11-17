import type { AccountType } from "@save-n-spend/types";
import { useSettings } from "@/store/settings";
import {
  MASKED_MONEY,
  balanceWord,
  formatMoneyExact,
  remainingWord,
  signFor,
  type MoneyOptions,
  type Sign,
} from "@/lib/format/money";

// The screen-facing money formatters: the pure ones in lib/format/money.ts behind the privacy
// mask. Files the user asked for use `formatMoneyExact`, which is never masked.
export { MASKED_MONEY, MINUS, formatMoneyExact, groupIndian, signFor } from "@/lib/format/money";
export type { MoneyOptions, Sign } from "@/lib/format/money";

// Whether amounts should currently be hidden. Privacy mode masks; an open peek
// un-masks it for a few seconds. Both live in the settings store, so this single
// expression is the only place the two are combined.
const isMasked = (privacyMode: boolean, peeking: boolean) => privacyMode && !peeking;

/** The mask, read now. For formatters outside this file (compact chart figures). */
export const amountsMasked = (): boolean => {
  const { privacyMode, peeking } = useSettings.getState();
  return isMasked(privacyMode, peeking);
};

/**
 * Subscribe a component to the mask.
 *
 * `formatMoney` reads the store imperatively, so a component that calls it does NOT re-render
 * when the mask changes. Any component rendering an amount must call this hook — the returned
 * boolean is usually ignored, the point is the subscription. Without it a peek reveals only the
 * amounts that happened to re-render for some other reason.
 *
 * One line per component beats converting every `formatMoney(...)` call site, half of which are
 * inside template literals and so can't be components.
 */
export const usePrivacyMask = (): boolean =>
  useSettings((s) => isMasked(s.privacyMode, s.peeking));

/** The masked form. A sign the caller asked for is kept, as `Money`'s prefix always was: a
 *  direction says nothing about a magnitude. Without one, every amount reads the same. */
export const maskedMoney = (paise: number, sign?: Sign): string =>
  sign ? `${signFor(Math.round(paise), sign)}${MASKED_MONEY}` : MASKED_MONEY;

// The formatter every screen uses. Read imperatively with `getState()` so the
// existing call sites stay plain function calls inside template strings; the
// `usePrivacyMask()` hook above is what makes them reactive.
const formatMoney = (paise: number, opts: MoneyOptions = {}): string =>
  amountsMasked() ? maskedMoney(paise, opts.sign) : formatMoneyExact(paise, opts);

/** An account balance in words where the type names the direction (D11 A):
 *  "₹12,000.00 owed", "₹3,000.00 overdrawn", "₹45,000.00 available", "Owes you ₹500.00"; a holding is its plain value. */
export const formatBalance = (balance: number, type: AccountType): string => {
  // A holding's balance is what it's worth; "available" would read oddly beside it.
  if (type === "investment") return formatMoney(balance);
  const amount = formatMoney(Math.abs(balance));
  if (type === "person") {
    const rounded = Math.round(balance);
    if (rounded === 0) return "Settled up";
    return rounded > 0 ? `Owes you ${amount}` : `You owe ${amount}`;
  }
  return `${amount} ${balanceWord(balance, type)}`;
};

/** A budget's remaining money: "₹2,000.00 left", "₹500.00 over". */
export const formatRemaining = (remaining: number): string =>
  `${formatMoney(Math.abs(remaining))} ${remainingWord(remaining)}`;

export const parseMoney = (value: string): number => {
  value = value.replace(/[^0-9.]/g, "");
  const floatedValue = parseFloat(value);
  if (isNaN(floatedValue)) {
    return NaN;
  }
  const paiseValue = Math.round(floatedValue * 100);

  return paiseValue;
}

export const paiseToInput = (paise: number): string => {
  return paise % 100 === 0 ? String(paise/100) : String((paise/100).toFixed(2));
}

export default formatMoney;
