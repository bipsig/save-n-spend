import type { Request } from "express";
import Category from "../models/Category";
import { dayBoundsFromKeyInZone } from "../utils/timezone";
import { resolveZone } from "../utils/userZone";

/** What Activity narrows by. The list and the summary read the same filter from here, so the
 *  card's totals are always over the rows beneath it. */
export type TransactionFilters = {
    startDate?: string;
    endDate?: string;
    /** Comma-separated ids; a parent also matches its children. */
    category?: string;
    /** Comma-separated ids; matches either side of a transfer. */
    account?: string;
    type?: "expense" | "income" | "transfer";
    search?: string;
    trips?: "exclude" | "only";
};

// Neutralise every regex metacharacter so a search term can only ever match itself.
// `$&` is the whole match, so each special character comes back escaped.
export const escapeRegex = (term: string): string => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The Mongo filter for `filters`, before casting. `categoryIds` is `filters.category` with each
 * parent's children added (see resolveTransactionFilter); `zone` is needed only with a range.
 */
export const transactionFilter = (
    userId: string,
    filters: TransactionFilters,
    { categoryIds, zone }: { categoryIds?: string[]; zone?: string },
): Record<string, unknown> => {
    const { startDate, endDate, account, type, search, trips } = filters;
    const filter: Record<string, unknown> = { userId };

    if (account) {
        // A transfer into one of them has it as `toAccount`, not `account` — matching only the
        // source side would silently drop every transfer these accounts received.
        const accountIds = account.split(",").filter(Boolean);
        filter.$or = [{ account: { $in: accountIds } }, { toAccount: { $in: accountIds } }];
    }
    if (categoryIds) {
        filter.category = { $in: categoryIds };
    }
    if (type) {
        filter.type = type;
    }
    else {
        // Balance corrections move an account's balance but are not money coming in or
        // going out, and Activity reads as a history of what the user actually did with
        // their money. They stay out of it, and so out of exports too: `lib/export.ts` asks
        // for this same list, so an export matches the Activity screen.
        filter.type = { $nin: ["positiveAdjustment", "negativeAdjustment"] };
    }
    if (trips === "exclude") {
        // The everyday list. A trip's rows are real money and still move balances, but they
        // are read on the trip and under Activity's Trips view, not among daily spending.
        // Matches a missing field too.
        filter.tripId = null;
    }
    else if (trips === "only") {
        filter.tripId = { $ne: null };
        // One row per trip expense: its share. The transfers recording what each friend owes
        // on it are the expense's bookkeeping — seven rows for one AirBnB said nothing more.
        // They stay on the trip's page and on each friend's account.
        filter.$nor = [{ type: "transfer", tripExpenseId: { $ne: null } }];
    }
    if (search) {
        // Escaped, not interpolated: a lone `(` would be an invalid pattern (a 500), and
        // `(a+)+b` backtracks catastrophically inside the database. The length cap lives in
        // the schema.
        filter.title = { $regex: escapeRegex(search), $options: "i" };
    }
    if (startDate && endDate && zone) {
        // Calendar days the user picked, so their bounds are the user's midnights, not UTC's:
        // otherwise a purchase made late last night goes missing from "Today".
        filter.occurredAt = {
            $gte: dayBoundsFromKeyInZone(startDate, zone).start,
            $lte: dayBoundsFromKeyInZone(endDate, zone).end,
        };
    }
    return filter;
};

/** `transactionFilter` for this request: expands the categories and reads the user's zone. */
export const resolveTransactionFilter = async (req: Request, filters: TransactionFilters): Promise<Record<string, unknown>> => {
    const userId = req.user!.userId;
    let categoryIds: string[] | undefined;
    if (filters.category) {
        // Each selected id can be a parent or a child; only parents have children to add.
        // Archived children are kept: their rows are still in the list.
        const picked = filters.category.split(",").filter(Boolean);
        const children = await Category.find({ parent: { $in: picked }, userId }, { _id: 1 });
        categoryIds = [...picked, ...children.map((child) => child._id.toString())];
    }
    const zone = filters.startDate && filters.endDate ? await resolveZone(req) : undefined;
    return transactionFilter(userId, filters, { categoryIds, zone });
};

export type SummaryGroup = { _id: { type: string; trip: boolean }; total: number };
export type TransactionSummaryTotals = { income: number; expenses: number; savings: number; tripExpenses: number };

/**
 * The summary card's figures from income/expense sums grouped by type and by whether the row
 * is on a trip. `trips` narrows `income` and `expenses` the way it narrows the list; `savings`
 * and `tripExpenses` count trip rows whatever it says, because a trip was money spent and the
 * card names it rather than letting the period look cheaper than it was.
 */
export const summaryTotals = (groups: SummaryGroup[], trips: TransactionFilters["trips"]): TransactionSummaryTotals => {
    const inView = (row: SummaryGroup) => (trips === "exclude" ? !row._id.trip : trips === "only" ? row._id.trip : true);
    const sum = (type: string, keep: (row: SummaryGroup) => boolean) =>
        groups.filter((row) => row._id.type === type && keep(row)).reduce((total, row) => total + row.total, 0);
    return {
        income: sum("income", inView),
        expenses: sum("expense", inView),
        savings: sum("income", () => true) - sum("expense", () => true),
        tripExpenses: sum("expense", (row) => row._id.trip),
    };
};
