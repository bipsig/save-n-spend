// The one place the SERVER renders an amount or a percentage.
//
// Money is integer paise everywhere else and formatting belongs to the client — but some copy is
// composed here (notifications, highlights, Health hints, the review's sentences), because a cron
// tick has to write "You've spent ₹8,400.00 of ₹8,000.00" with no app running to ask. The rules
// are the app's (2.8.2): exact paise, one decimal on a percentage, and the true minus "−".

/** U+2212, as the app prints it. */
export const MINUS = "\u2212";

// INR only (gaps row 172): the app prints "₹" itself, so a second currency here would put
// "$84" next to "₹84". User.currency stays on the document for older apps to read.
const INR = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

/** `839_950` → `"₹8,399.50"`, `-45_000` → `"−₹450.00"`. */
export const formatAmount = (paise: number): string => {
    const rounded = Math.round(paise);
    const text = INR.format(Math.abs(rounded) / 100);
    return rounded < 0 ? `${MINUS}${text}` : text;
};

/** A ratio as a percentage to one decimal: `0.0596` → `"6.0%"`, `-0.051` → `"−5.1%"`. A share
 *  that rounds to zero is `"0.0%"`, never signed. */
export const formatPercent = (ratio: number): string => {
    const pct = ratio * 100;
    const tenth = Math.round(Math.abs(pct) * 10 + 1e-9) / 10;
    return `${pct < 0 && tenth > 0 ? MINUS : ""}${tenth.toFixed(1)}%`;
};
