import mongoose from "mongoose";
import Bill from "../models/Bill";
import Category from "../models/Category";
import RecurringDismissal from "../models/RecurringDismissal";
import Transaction from "../models/Transaction";
import { addDaysInZone, addMonthsInZone, startOfDayInZone, startOfMonthInZone } from "../utils/timezone";
import { detectRecurring, matchesBill, normalizeTitle, type DetectedPattern, type RecurringInput } from "./recurringMath";
import type { RecurringPattern, RecurringSuggestionsPayload } from "@save-n-spend/types";

/** Months of history the detector reads — enough for MIN_MONTHS with a skipped month. */
const LOOKBACK_MONTHS = 6;
/** The window typical daily spending is averaged over. */
const SPEND_WINDOW_DAYS = 90;
/** Floor on that average's divisor, so a brand-new account's two purchases aren't spread
 *  over two days and read as a huge daily rate. */
const MIN_SPEND_DAYS = 14;

const toOid = (id: string | mongoose.Types.ObjectId) => new mongoose.Types.ObjectId(String(id));

const loadRows = async (oid: mongoose.Types.ObjectId, since: Date): Promise<RecurringInput[]> => {
    const [txns, categories] = await Promise.all([
        Transaction.find({ userId: oid, type: { $in: ["expense", "income"] }, occurredAt: { $gte: since } })
            .select("type title amount category account occurredAt splitGroupId")
            .lean(),
        Category.find({ userId: oid }).select("name").lean(),
    ]);
    const nameById = new Map(categories.map((c) => [String(c._id), c.name]));
    return txns
        .filter((t) => t.title)
        .map((t) => ({
            id: String(t._id),
            type: t.type as "expense" | "income",
            title: t.title as string,
            amount: t.amount,
            category: t.category ? String(t.category) : null,
            categoryName: t.category ? nameById.get(String(t.category)) ?? null : null,
            account: t.account ? String(t.account) : null,
            occurredAt: new Date(t.occurredAt),
            split: !!t.splitGroupId,
        }));
};

const toPayload = (p: DetectedPattern): RecurringPattern => ({
    ...p,
    lastAt: p.lastAt.toISOString(),
    nextExpectedAt: p.nextExpectedAt.toISOString(),
});

/** Every pattern the detector found that the user hasn't dismissed, plus their bills — the
 *  shared input to both the suggestions and the cash-flow projection. */
export const loadRecurringPatterns = async (
    userId: string | mongoose.Types.ObjectId,
    zone: string,
    now: Date,
) => {
    const oid = toOid(userId);
    const since = startOfMonthInZone(addMonthsInZone(now, zone, -LOOKBACK_MONTHS), zone);

    const [rows, bills, dismissals] = await Promise.all([
        loadRows(oid, since),
        Bill.find({ userId: oid }).select("name category amount").lean(),
        RecurringDismissal.find({ userId: oid }).select("key").lean(),
    ]);

    const dismissed = new Set(dismissals.map((d) => d.key));
    const billFacts = bills.map((b) => ({ name: b.name, category: b.category ? String(b.category) : null, amount: b.amount }));
    const patterns = detectRecurring(rows, now, zone).filter((p) => !dismissed.has(p.key));
    return { patterns, billFacts };
};

/** What's worth suggesting: expenses that aren't a bill yet, and income. */
export const getRecurringSuggestions = async (
    userId: string | mongoose.Types.ObjectId,
    zone: string,
    now: Date = new Date(),
): Promise<RecurringSuggestionsPayload> => {
    const { patterns, billFacts } = await loadRecurringPatterns(userId, zone, now);
    return {
        expenses: patterns.filter((p) => p.kind === "expense" && !matchesBill(p, billFacts)).map(toPayload),
        income: patterns.filter((p) => p.kind === "income").map(toPayload),
    };
};

export const dismissRecurring = async (userId: string, key: string): Promise<void> => {
    await RecurringDismissal.updateOne(
        { userId: toOid(userId), key },
        { $setOnInsert: { userId: toOid(userId), key } },
        { upsert: true },
    );
};

/**
 * Average spending per day over the last 90 days, leaving out what the calendar already
 * places on its own day: anything matching a bill, and the recurring expenses the detector
 * found. Without that, rent would be counted twice — once on its due date and again smeared
 * across every day.
 */
export const typicalDailySpend = async (
    userId: string | mongoose.Types.ObjectId,
    zone: string,
    now: Date,
    recurringKeys: Set<string>,
    billNames: string[],
): Promise<number> => {
    const oid = toOid(userId);
    const since = addDaysInZone(startOfDayInZone(now, zone), zone, -SPEND_WINDOW_DAYS);
    const scheduled = new Set([...recurringKeys, ...billNames.map((n) => `expense:${normalizeTitle(n)}`)]);

    const expenses = await Transaction.find({ userId: oid, type: "expense", occurredAt: { $gte: since, $lt: now } })
        .select("title amount occurredAt")
        .lean();
    if (expenses.length === 0) return 0;

    const total = expenses
        .filter((t) => !scheduled.has(`expense:${normalizeTitle(t.title ?? "")}`))
        .reduce((sum, t) => sum + t.amount, 0);

    const earliest = Math.min(...expenses.map((t) => new Date(t.occurredAt).getTime()));
    const covered = Math.ceil((now.getTime() - Math.max(earliest, since.getTime())) / 86_400_000);
    return Math.round(total / Math.max(MIN_SPEND_DAYS, Math.min(SPEND_WINDOW_DAYS, covered)));
};

/** Short, stable signature of a set of pattern keys — so a highlight or notification about
 *  "these suggestions" fires again only when the set actually changes. */
export const keysSignature = (keys: string[]): string => {
    let h = 5381;
    for (const ch of [...keys].sort().join("|")) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
    return (h >>> 0).toString(36);
};
