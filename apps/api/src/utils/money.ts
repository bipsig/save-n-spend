// The one place the SERVER renders an amount or a percentage.
//
// Money is integer paise everywhere else and formatting belongs to the client — but some copy is
// composed here (notifications, highlights, Health hints, the review's sentences), because a cron
// tick has to write "You've spent ₹8,400.00 of ₹8,000.00" with no app running to ask. The rules
// are the app's (2.8.2): exact paise, one decimal on a percentage, and the true minus "−".

/** U+2212, as the app prints it. */
export const MINUS = "\u2212";

const formatters = new Map<string, Intl.NumberFormat>();

const formatterFor = (currency: string): Intl.NumberFormat => {
    const cached = formatters.get(currency);
    if (cached) return cached;

    const formatter = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    formatters.set(currency, formatter);
    return formatter;
};

/** `839_950` → `"₹8,399.50"`, `-45_000` → `"−₹450.00"`. Falls back to INR for a currency `Intl` doesn't know. */
export const formatAmount = (paise: number, currency = "INR"): string => {
    const rounded = Math.round(paise);
    const rupees = Math.abs(rounded) / 100;
    let text: string;
    try {
        text = formatterFor(currency).format(rupees);
    }
    catch {
        // A bad currency code on a user document must not take a notification down
        // with it — the figure still carries the message.
        text = formatterFor("INR").format(rupees);
    }
    return rounded < 0 ? `${MINUS}${text}` : text;
};

/** A ratio as a percentage to one decimal: `0.0596` → `"6.0%"`, `-0.051` → `"−5.1%"`. A share
 *  that rounds to zero is `"0.0%"`, never signed. */
export const formatPercent = (ratio: number): string => {
    const pct = ratio * 100;
    const tenth = Math.round(Math.abs(pct) * 10 + 1e-9) / 10;
    return `${pct < 0 && tenth > 0 ? MINUS : ""}${tenth.toFixed(1)}%`;
};
