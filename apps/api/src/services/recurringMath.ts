import { addMonthsInZone, monthLabelInZone } from "../utils/timezone";

// Spotting what repeats. Pure over plain rows so it can be tested without a database; the
// service feeds it the last few months of income and expenses.
//
// "Recurring" here means monthly: the same title in at least MIN_MONTHS different months,
// about a month apart, at a steady amount, and still going. That's deliberately strict — a
// wrong suggestion ("Swiggy order looks like a bill") costs more trust than a missed one.

export type RecurringInput = {
    id: string;
    type: "expense" | "income";
    title: string;
    amount: number;
    category: string | null;
    categoryName: string | null;
    account: string | null;
    occurredAt: Date;
    /** Part of a split — its amount is only the user's share, so it's never moved to an
     *  investment in bulk. */
    split: boolean;
};

export type DetectedPattern = {
    key: string;
    kind: "expense" | "income";
    title: string;
    amount: number;
    category: string | null;
    categoryName: string | null;
    account: string | null;
    occurrences: number;
    lastAt: Date;
    nextExpectedAt: Date;
    looksLikeSip: boolean;
    transactionIds: string[];
};

export const MIN_MONTHS = 3;
/** Consecutive occurrences must land this many days apart to read as monthly. */
const MIN_GAP_DAYS = 20;
const MAX_GAP_DAYS = 40;
/** One skipped month (a gap of about two months) is tolerated, once. */
const SKIP_GAP_MIN = 50;
const SKIP_GAP_MAX = 70;
/** Every amount must sit this close to the median. Income gets more room (bonuses, a
 *  partial month's pay) than a bill, which is usually the exact same figure. */
const EXPENSE_TOLERANCE = 0.15;
const INCOME_TOLERANCE = 0.2;
/** Not seen for longer than this and it has probably stopped — a cancelled subscription
 *  shouldn't be suggested as a bill. */
const MAX_DAYS_SINCE_LAST = 45;

const DAY_MS = 86_400_000;

const SIP_PATTERN = /\b(sip|sips|mutual funds?|mf|elss|ppf|nps|index fund|nifty|sensex)\b/i;

/** Lowercase, digits and punctuation dropped, whitespace collapsed — so "Netflix", "netflix "
 *  and "Netflix #4411" group together. */
export const normalizeTitle = (title: string): string =>
    title
        .toLowerCase()
        .replace(/[0-9]/g, " ")
        .replace(/[^\p{L}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();

export const looksLikeInvestment = (title: string, categoryName: string | null): boolean =>
    SIP_PATTERN.test(title) || (!!categoryName && SIP_PATTERN.test(categoryName));

const median = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

const mostCommon = <T>(values: T[]): T | null => {
    const counts = new Map<T, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    let best: T | null = null;
    let bestCount = 0;
    for (const [v, c] of counts) {
        if (c > bestCount) {
            best = v;
            bestCount = c;
        }
    }
    return best;
};

const isMonthlyCadence = (dates: Date[]): boolean => {
    let skips = 0;
    for (let i = 1; i < dates.length; i++) {
        const gap = (dates[i].getTime() - dates[i - 1].getTime()) / DAY_MS;
        if (gap >= MIN_GAP_DAYS && gap <= MAX_GAP_DAYS) continue;
        if (gap >= SKIP_GAP_MIN && gap <= SKIP_GAP_MAX && skips === 0) {
            skips += 1;
            continue;
        }
        return false;
    }
    return true;
};

/** Groups rows whose amounts sit within one tolerance band of the band's smallest. */
const splitByAmount = (rows: RecurringInput[], tolerance: number): RecurringInput[][] => {
    const byAmount = [...rows].sort((a, b) => a.amount - b.amount);
    const streams: RecurringInput[][] = [];
    for (const row of byAmount) {
        const current = streams[streams.length - 1];
        if (current && row.amount <= current[0].amount * (1 + tolerance)) current.push(row);
        else streams.push([row]);
    }
    return streams;
};

/** One stream of same-titled, similar-amount rows → a pattern, or null if it isn't a steady,
 *  still-running monthly one. */
const judgeStream = (
    rows: RecurringInput[],
    now: Date,
    zone: string,
    tolerance: number,
): Omit<DetectedPattern, "key"> | null => {
    const sorted = [...rows].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

    // One occurrence per month. More than one extra means it's weekly or ad hoc
    // (groceries, cabs), not a monthly commitment.
    const byMonth = new Map<string, RecurringInput>();
    for (const row of sorted) byMonth.set(monthLabelInZone(row.occurredAt, zone), row);
    if (byMonth.size < MIN_MONTHS) return null;
    if (sorted.length > byMonth.size + 1) return null;

    const monthly = [...byMonth.values()];
    if (!isMonthlyCadence(monthly.map((r) => r.occurredAt))) return null;

    const amounts = monthly.map((r) => r.amount);
    const typical = median(amounts);
    if (typical <= 0 || amounts.some((a) => Math.abs(a - typical) > typical * tolerance)) return null;

    const last = sorted[sorted.length - 1];
    if ((now.getTime() - last.occurredAt.getTime()) / DAY_MS > MAX_DAYS_SINCE_LAST) return null;

    const kind = last.type;
    const categoryName = last.categoryName ?? mostCommon(sorted.map((r) => r.categoryName));
    return {
        kind,
        title: last.title.trim(),
        amount: typical,
        category: mostCommon(sorted.map((r) => r.category)),
        categoryName,
        account: mostCommon(sorted.map((r) => r.account)),
        occurrences: byMonth.size,
        lastAt: last.occurredAt,
        nextExpectedAt: addMonthsInZone(last.occurredAt, zone, 1),
        looksLikeSip: kind === "expense" && looksLikeInvestment(last.title, categoryName),
        transactionIds: kind === "expense"
            ? sorted.filter((r) => !r.split).map((r) => r.id).reverse()
            : [],
    };
};

export const detectRecurring = (rows: RecurringInput[], now: Date, zone: string): DetectedPattern[] => {
    const groups = new Map<string, RecurringInput[]>();
    for (const row of rows) {
        const norm = normalizeTitle(row.title ?? "");
        if (!norm) continue;
        const key = `${row.type}:${norm}`;
        const list = groups.get(key);
        if (list) list.push(row);
        else groups.set(key, [row]);
    }

    const out: DetectedPattern[] = [];
    for (const [baseKey, list] of groups) {
        const kind = list[0].type;
        const tolerance = kind === "income" ? INCOME_TOLERANCE : EXPENSE_TOLERANCE;
        // One title can carry more than one stream — two salaries both called "Monthly
        // salary", or a subscription plus an occasional one-off under the same name. Split by
        // amount first and judge each stream on its own, or they'd disqualify each other.
        const found = splitByAmount(list, tolerance)
            .map((stream) => judgeStream(stream, now, zone, tolerance))
            .filter((p): p is Omit<DetectedPattern, "key"> => p !== null)
            .sort((a, b) => b.occurrences - a.occurrences || b.amount - a.amount);
        // The strongest stream keeps the plain key, so a dismissal made before a second
        // stream appeared still applies to it. Any other gets its amount appended.
        found.forEach((p, i) => out.push({ ...p, key: i === 0 ? baseKey : `${baseKey}:${Math.round(p.amount / 100)}` }));
    }

    // Biggest first — the suggestion worth acting on leads.
    return out.sort((a, b) => b.amount - a.amount);
};

/** Does this pattern already have a bill? Same normalised name, or the same category at
 *  about the same amount (a bill named "Rent" covering transactions titled "House rent"). */
export const matchesBill = (
    pattern: Pick<DetectedPattern, "title" | "category" | "amount">,
    bills: { name: string; category: string | null; amount: number }[],
): boolean => {
    const norm = normalizeTitle(pattern.title);
    return bills.some((b) =>
        normalizeTitle(b.name) === norm
        || (!!pattern.category && b.category === pattern.category
            && Math.abs(b.amount - pattern.amount) <= pattern.amount * EXPENSE_TOLERANCE));
};
