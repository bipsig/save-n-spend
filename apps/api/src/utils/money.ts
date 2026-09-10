// The one place the SERVER renders an amount.
//
// Money is integer paise everywhere else and formatting belongs to the client — but notification
// copy is composed here, because a cron tick has to write "You've spent ₹8,400 of ₹8,000" with no
// app running to ask. Rounded to whole rupees: "₹8,400" reads in the time someone spends looking
// at a lock screen, "₹8,399.50" does not.

const formatters = new Map<string, Intl.NumberFormat>();

const formatterFor = (currency: string): Intl.NumberFormat => {
    const cached = formatters.get(currency);
    if (cached) return cached;

    const formatter = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
    });
    formatters.set(currency, formatter);
    return formatter;
};

/** `840_000` → `"₹8,400"`. Falls back to INR for a currency `Intl` doesn't know. */
export const formatAmount = (paise: number, currency = "INR"): string => {
    const rupees = Math.round(paise / 100);
    try {
        return formatterFor(currency).format(rupees);
    }
    catch {
        // A bad currency code on a user document must not take a notification down
        // with it — the figure still carries the message.
        return formatterFor("INR").format(rupees);
    }
};
