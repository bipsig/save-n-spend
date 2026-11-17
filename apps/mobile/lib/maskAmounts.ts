import { MASKED_MONEY } from "@/lib/money";

// Rupee figures inside sentences the server wrote (notifications, highlights, Review, Health),
// which reach the app as finished text. Pure, so it's tested under node (maskAmounts.test.ts).
//
// A figure is an optional sign glued to "₹", then Indian- or Western-grouped digits, optional
// decimals (whole rupees before 2.8.4, exact paise after), an optional lakh/crore/thousand
// suffix, and an optional bare second number after a dash ("₹4,200–5,000"). The sign goes with
// the figure, as `formatMoney` masks "−₹450" whole. Percentages and other numbers stay.
//
// shortcut: only "₹" is recognised. User.currency is INR for every account today and nothing
// in the app changes it; if another currency is ever offered, add its symbol here.
const FIGURE = /(^|[^A-Za-z0-9])([+\-−]?₹\s?\d+(?:,\d+)*(?:\.\d+)?(?:(?:Cr|[LKk])\b|\s(?:lakhs?|crores?)\b)?(?:[–-]\d+(?:,\d+)*(?:\.\d+)?)?)/g;

export type SentencePart = { text: string; amount: boolean };

/** The sentence cut into runs of words and figures, in order. Joining every `text` gives the
 *  sentence back unchanged. */
export const splitAmounts = (sentence: string): SentencePart[] => {
  const parts: SentencePart[] = [];
  const figure = new RegExp(FIGURE);
  let from = 0;
  let match: RegExpExecArray | null;
  while ((match = figure.exec(sentence))) {
    const start = match.index + match[1].length;
    if (start > from) parts.push({ text: sentence.slice(from, start), amount: false });
    parts.push({ text: match[2], amount: true });
    from = start + match[2].length;
  }
  if (from < sentence.length) parts.push({ text: sentence.slice(from), amount: false });
  return parts;
};

/** What VoiceOver reads in place of a hidden figure. */
export const AMOUNT_HIDDEN = "amount hidden";

/** The sentence with every rupee figure replaced, "₹ ••••" unless told otherwise. */
export const maskAmounts = (sentence: string, replacement: string = MASKED_MONEY): string =>
  splitAmounts(sentence).map((p) => (p.amount ? replacement : p.text)).join("");
