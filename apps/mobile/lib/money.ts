import { useSettings } from "@/store/settings";

// Format integer paise into an Indian-grouped rupee string.
// Decimals are shown only when there are non-zero paise, so whole amounts stay clean.
//   5240000 -> "₹52,400"   125050 -> "₹1,250.50"   -45000 -> "-₹450"
//
// This is the unmasked formatter. Screens should use the default export, which
// honours privacy mode; reach for this one only where masking would be wrong —
// namely a file the user explicitly asked us to generate (see lib/export.ts).
export const formatMoneyExact = (paise: number): string => {
  const isNegative = paise < 0;
  const absPaise = Math.abs(Math.round(paise));
  const rupees = Math.floor(absPaise / 100);
  const paiseRemainder = absPaise % 100;

  // Indian digit grouping on the rupee part: last 3 digits, then groups of 2.
  const digits = rupees.toString();
  let result = "";
  let slots = 3;
  for (let i = digits.length - 1; i>= 0; i--) {
    if (slots > 0) {
      result = digits [i] + result;
      slots--;
    }
    else {
      result = "," + result;
      i++;
      slots = 2;
    }
  }

  result = "₹" + result;
  if (paiseRemainder > 0) {
    result = result + "." + paiseRemainder.toString().padStart(2, "0");
  }
  if (isNegative) {
    result = "-" + result;
  }

  return result;
}

// What an amount reads as with privacy mode on — a fixed width regardless of the
// figure, so the mask itself can't leak the magnitude.
export const MASKED_MONEY = "₹ ••••";

// Whether amounts should currently be hidden. Privacy mode masks; an open peek
// un-masks it for a few seconds. Both live in the settings store, so this single
// expression is the only place the two are combined.
const isMasked = (privacyMode: boolean, peeking: boolean) => privacyMode && !peeking;

/**
 * Subscribe a component to the mask.
 *
 * `formatMoney` reads the store imperatively, which means a component that calls
 * it does NOT re-render when the mask changes. Any component that renders an
 * amount must therefore call this hook — the returned boolean is usually ignored;
 * the point is the subscription. Without it a peek would reveal only the handful
 * of amounts that happened to re-render for some other reason.
 *
 * One line per component beats converting sixty-nine `formatMoney(...)` call
 * sites, half of which are inside template literals and so can't be components.
 */
export const usePrivacyMask = (): boolean =>
  useSettings((s) => isMasked(s.privacyMode, s.peeking));

// The formatter every screen uses. Read imperatively with `getState()` so the
// existing call sites stay plain function calls inside template strings; the
// `usePrivacyMask()` hook above is what makes them reactive.
const formatMoney = (paise: number): string => {
  const { privacyMode, peeking } = useSettings.getState();
  return isMasked(privacyMode, peeking) ? MASKED_MONEY : formatMoneyExact(paise);
};

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
