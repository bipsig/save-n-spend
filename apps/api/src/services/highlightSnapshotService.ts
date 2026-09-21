import mongoose from "mongoose";
import Account from "../models/Account";
import Bill from "../models/Bill";
import Category from "../models/Category";
import Goal from "../models/Goal";
import Transaction from "../models/Transaction";
import { budgetProgress } from "./budgetService";
import { healthScore } from "./healthService";
import { daysUntilDue, isSettledForPeriod } from "./billService";
import { addDaysInZone } from "../utils/timezone";
import { currentStreak, STREAK_LOOKBACK_DAYS } from "./streakMath";
import {
    categoryRoller,
    contributionStreak,
    monthOrdinal,
    rollUpFlows,
    snapshotWindow,
    wholeDays,
} from "./highlightSnapshotMath";
import type {
    AccountFact,
    BillFact,
    BudgetFact,
    GoalFact,
    Snapshot,
} from "./highlightRules";

// Assembles the one Snapshot the highlight rules run over — the I/O half of the split.
// Everything zone- or clock-shaped is resolved here or in highlightSnapshotMath, so the rules
// stay pure: they get "11 days left", never a Date to interpret.
//
// Numbers already computed somewhere trusted are reused, not re-derived: budget spend from
// budgetService, the health focus from healthService. A highlight that disagrees with the screen
// it links to would be worse than no highlight.
//
// Only what needs the database stays here; the calendar window and the category rollup live in
// highlightSnapshotMath, where fixtures cover them.

type SpendGroup = { _id: { month: string; category: mongoose.Types.ObjectId | null }; total: number };
type TotalsGroup = { _id: { month: string; type: "income" | "expense" }; total: number };

/**
 * Consecutive zone-local days with at least one logged transaction — its own function,
 * not folded silently into `buildSnapshot`, because the controller needs this number
 * even on the warm-up path where a Snapshot is never built at all (see streakMath.ts and
 * highlightController.ts).
 */
export const computeCurrentStreak = async (
    userId: string | mongoose.Types.ObjectId,
    zone: string,
    now: Date,
): Promise<number> => {
    const oid = new mongoose.Types.ObjectId(String(userId));
    const since = addDaysInZone(now, zone, -STREAK_LOOKBACK_DAYS);

    const dayRows = await Transaction.aggregate<{ _id: string }>([
        {
            $match: {
                userId: oid,
                // Same exclusion filterTransactions uses for "what the user actually did
                // with their money" — a balance correction isn't a logged entry.
                type: { $nin: ["positiveAdjustment", "negativeAdjustment"] },
                occurredAt: { $gte: since },
            },
        },
        { $group: { _id: { $dateToString: { date: "$occurredAt", format: "%Y-%m-%d", timezone: zone } } } },
    ]);

    return currentStreak(new Set(dayRows.map((r) => r._id)), now, zone);
};

/**
 * One user's money, as of `now`, cut in their zone. `firstTxnAt` and `streakDays` are
 * passed in rather than re-queried because the controller already fetched them (the
 * former for the warming-up gate, the latter because it needs it even when this function
 * never runs) — it bounds how many months the category averages honestly cover.
 */
export const buildSnapshot = async (
    userId: string | mongoose.Types.ObjectId,
    zone: string,
    currency: string,
    now: Date,
    firstTxnAt: Date,
    streakDays: number,
): Promise<Snapshot> => {
    const oid = new mongoose.Types.ObjectId(String(userId));

    const window = snapshotWindow(zone, now, firstTxnAt);
    const { label, prevLabel, next, windowStart } = window;

    const monthKey = { $dateToString: { date: "$occurredAt", format: "%Y-%m", timezone: zone } };

    const [accounts, categories, budgetsNow, budgetsPrev, bills, goals, health, [groups]] = await Promise.all([
        Account.find({ userId: oid, isArchived: false }).select("name type balance").lean(),
        Category.find({ userId: oid }).select("name parent").lean(),
        budgetProgress(oid, zone, label),
        budgetProgress(oid, zone, prevLabel),
        Bill.find({ userId: oid }).select("name amount account dueDate lastPaidAt status recurring frequency").lean(),
        Goal.find({ userId: oid }).select("name target saved deadline createdAt").lean(),
        healthScore(oid, zone, now),
        // Four months of income/expense in one pass: month totals for the savings
        // rate, per-category spend for the pace comparisons. Transfers and
        // adjustments are excluded exactly as insights excludes them.
        Transaction.aggregate<{ totals: TotalsGroup[]; spend: SpendGroup[] }>([
            {
                $match: {
                    userId: oid,
                    type: { $in: ["income", "expense"] },
                    occurredAt: { $gte: windowStart, $lt: next },
                },
            },
            {
                $facet: {
                    totals: [
                        { $group: { _id: { month: monthKey, type: "$type" }, total: { $sum: "$amount" } } },
                    ],
                    spend: [
                        { $match: { type: "expense" } },
                        { $group: { _id: { month: monthKey, category: "$category" }, total: { $sum: "$amount" } } },
                    ],
                },
            },
        ]),
    ]);

    // Flattened out of Mongo's `_id` nesting and stringified on the way through, so
    // the pure layer never has to know an ObjectId from a string.
    const roll = categoryRoller(categories.map((c) => ({
        _id: String(c._id),
        name: c.name,
        parent: c.parent ? String(c.parent) : null,
    })));
    const flows = rollUpFlows(window, roll, {
        totals: groups.totals.map((r) => ({ month: r._id.month, type: r._id.type, total: r.total })),
        spend: groups.spend.map((r) => ({
            month: r._id.month,
            categoryId: r._id.category ? String(r._id.category) : null,
            total: r.total,
        })),
    });

    // Facts, calendar arithmetic done here so the rules never touch a Date.
    const accountFacts: AccountFact[] = accounts.map((a) => ({
        accountId: String(a._id),
        name: a.name,
        type: a.type,
        balance: a.balance,
    }));

    const budgetFacts = (items: { budget: { category: mongoose.Types.ObjectId; limit: number }; spent: number }[]): BudgetFact[] =>
        items.map(({ budget, spent }) => ({
            categoryId: String(budget.category),
            categoryName: roll.rollName(String(budget.category)),
            limit: budget.limit,
            spent,
        }));

    const billFacts: BillFact[] = bills
        // Settled bills have nothing to warn about. A recurring bill is never marked
        // paid — its evidence is lastPaidAt in the current period, same as the bills
        // screen reads it.
        .filter((bill) => (bill.recurring ? !isSettledForPeriod(bill, now, zone) : bill.status !== "paid"))
        .map((bill) => ({
            name: bill.name,
            amount: bill.amount,
            daysUntilDue: daysUntilDue(bill.dueDate, now, zone),
            accountId: bill.account ? String(bill.account) : null,
        }));

    const goalFacts: GoalFact[] = goals.map((goal) => ({
        name: goal.name,
        target: goal.target,
        saved: goal.saved,
        monthsSinceCreated: Math.max(0, monthOrdinal(now, zone) - monthOrdinal(goal.createdAt, zone)),
        monthsUntilDeadline: goal.deadline ? monthOrdinal(goal.deadline, zone) - monthOrdinal(now, zone) : null,
    }));

    // Investment facts for the investment highlight rules. Reuses the accounts already
    // fetched above; only the value-update recency and the contribution months need their
    // own (small) queries, and only when the user actually holds investments.
    const investmentAccounts = accounts.filter((a) => a.type === "investment");
    let investments = { hasInvestments: false, totalValue: 0, daysSinceRevalued: null as number | null, contributionStreakMonths: 0 };
    if (investmentAccounts.length > 0) {
        const invIds = investmentAccounts.map((a) => a._id);
        const [lastAdj, contribMonthRows] = await Promise.all([
            Transaction.aggregate<{ _id: null; last: Date }>([
                { $match: { userId: oid, type: { $in: ["positiveAdjustment", "negativeAdjustment"] }, account: { $in: invIds } } },
                { $group: { _id: null, last: { $max: "$occurredAt" } } },
            ]),
            Transaction.aggregate<{ _id: string }>([
                { $match: { userId: oid, type: "transfer", toAccount: { $in: invIds } } },
                { $group: { _id: { $dateToString: { date: "$occurredAt", format: "%Y-%m", timezone: zone } } } },
            ]),
        ]);
        const last = lastAdj[0]?.last;
        investments = {
            hasInvestments: true,
            totalValue: investmentAccounts.reduce((sum, a) => sum + a.balance, 0),
            daysSinceRevalued: last ? wholeDays(new Date(last), now, zone) : null,
            contributionStreakMonths: contributionStreak(new Set(contribMonthRows.map((r) => r._id)), now, zone),
        };
    }

    return {
        currency,
        monthLabel: label,
        daysElapsed: window.daysElapsed,
        daysInMonth: window.daysInMonth,
        accounts: accountFacts,
        budgets: budgetFacts(budgetsNow.items),
        prevBudgets: budgetFacts(budgetsPrev.items),
        bills: billFacts,
        goals: goalFacts,
        healthFocus: health.focus ? { label: health.focus.label, hint: health.focus.hint } : null,
        thisMonth: {
            income: flows.current.income,
            expense: flows.current.expense,
            byCategory: flows.thisMonthByCategory,
        },
        months: flows.months,
        categoryAverages: flows.categoryAverages,
        currentStreak: streakDays,
        investments,
    };
};
