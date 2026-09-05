import mongoose from "mongoose";
import Account from "../models/Account";
import Bill from "../models/Bill";
import Category from "../models/Category";
import Goal from "../models/Goal";
import Transaction from "../models/Transaction";
import { budgetProgress } from "./budgetService";
import { healthScore } from "./healthService";
import { daysUntilDue, isSettledForPeriod } from "./billService";
import { monthRange } from "../utils/monthRange";
import {
    addMonthsInZone,
    monthLabelInZone,
    partsInZone,
    startOfDayInZone,
} from "../utils/timezone";
import type {
    AccountFact,
    BillFact,
    BudgetFact,
    CategoryTotal,
    GoalFact,
    MonthTotals,
    Snapshot,
} from "./highlightRules";

// Assembles the one Snapshot the highlight rules run over — the I/O half of the
// split. Everything zone- or clock-shaped is resolved here, so the rules stay pure:
// they get "11 days left", never a Date to interpret.
//
// Wherever a number is already computed somewhere trusted, it is reused rather than
// re-derived: budget spend comes from budgetService (the budgets screen's number),
// the health focus from healthService (the health screen's number). A highlight that
// disagrees with the screen it links to would be worse than no highlight.

const MS_PER_DAY = 86_400_000;

/** How many complete months feed the per-category averages, at most. */
const AVERAGE_MONTHS = 3;

/** Where expenses with no category at all are filed for the rollup. Named to match
 *  the catch-all detection in the rules, so uncategorised spend counts as catch-all. */
const UNCATEGORISED = { id: "uncategorised", name: "Uncategorised" };

/** Whole zone-local days between two instants, boundaries crossed, DST absorbed. */
const wholeDays = (from: Date, to: Date, zone: string): number =>
    Math.round((startOfDayInZone(to, zone).getTime() - startOfDayInZone(from, zone).getTime()) / MS_PER_DAY);

/** Zone-local month index from year 0, so two months compare with a single `-`.
 *  Same convention as billService's period arithmetic. */
const monthOrdinal = (instant: Date, zone: string): number => {
    const { year, month } = partsInZone(instant, zone);
    return year * 12 + (month - 1);
};

type SpendRow = { _id: { month: string; category: mongoose.Types.ObjectId | null }; total: number };
type TotalsRow = { _id: { month: string; type: "income" | "expense" }; total: number };

/**
 * One user's money, as of `now`, cut in their zone. `firstTxnAt` is passed in
 * rather than re-queried because the controller already fetched it for the
 * warming-up gate — it bounds how many months the category averages honestly cover.
 */
export const buildSnapshot = async (
    userId: string | mongoose.Types.ObjectId,
    zone: string,
    currency: string,
    now: Date,
    firstTxnAt: Date,
): Promise<Snapshot> => {
    const oid = new mongoose.Types.ObjectId(String(userId));

    // The current month's bounds and label, anchored on the injected `now` so a test
    // (or a request served just past a zone-local midnight) is never split across
    // two ideas of "this month".
    const { start, next, label } = monthRange(zone, monthLabelInZone(now, zone));
    const daysElapsed = Math.max(1, wholeDays(start, now, zone) + 1);
    const daysInMonth = wholeDays(start, next, zone);
    const prevLabel = monthLabelInZone(addMonthsInZone(start, zone, -1), zone);

    // The complete months behind this one, oldest first — the comparison base.
    const completeLabels = Array.from({ length: AVERAGE_MONTHS }, (_, i) =>
        monthLabelInZone(addMonthsInZone(start, zone, i - AVERAGE_MONTHS), zone));
    const windowStart = addMonthsInZone(start, zone, -AVERAGE_MONTHS);

    // An average over months the account didn't exist for would read as a collapse
    // in spending, so the divisor is the months there is actually history for.
    const monthsAveraged = Math.min(
        AVERAGE_MONTHS,
        Math.max(1, monthOrdinal(now, zone) - monthOrdinal(firstTxnAt, zone)),
    );

    const monthKey = { $dateToString: { date: "$occurredAt", format: "%Y-%m", timezone: zone } };

    const [accounts, categories, budgetsNow, budgetsPrev, bills, goals, health, [flows]] = await Promise.all([
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
        Transaction.aggregate<{ totals: TotalsRow[]; spend: SpendRow[] }>([
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

    // --- Month totals -------------------------------------------------------------
    const totalsByMonth = new Map<string, { income: number; expense: number }>();
    for (const row of flows.totals) {
        const entry = totalsByMonth.get(row._id.month) ?? { income: 0, expense: 0 };
        entry[row._id.type] += row.total;
        totalsByMonth.set(row._id.month, entry);
    }
    const months: MonthTotals[] = completeLabels
        // Months before the account existed are absent, not zero — a zero month
        // would hand the savings-rate rule a fake collapse to announce.
        .slice(AVERAGE_MONTHS - monthsAveraged)
        .map((monthLabel) => ({ label: monthLabel, ...(totalsByMonth.get(monthLabel) ?? { income: 0, expense: 0 }) }));
    const current = totalsByMonth.get(label) ?? { income: 0, expense: 0 };

    // --- Per-category spend, children rolled into parents ---------------------------
    // The same rollup insights' breakdown uses, so a highlight about "Food & Dining"
    // means the same slice the chart draws.
    const parentOf = new Map(categories.map((c) => [String(c._id), c.parent ? String(c.parent) : null]));
    const nameOf = new Map(categories.map((c) => [String(c._id), c.name]));
    const rollKey = (category: mongoose.Types.ObjectId | null): string => {
        if (!category) return UNCATEGORISED.id;
        const id = String(category);
        return parentOf.get(id) ?? id;
    };
    const rollName = (key: string): string =>
        key === UNCATEGORISED.id ? UNCATEGORISED.name : nameOf.get(key) ?? UNCATEGORISED.name;

    const currentByCategory = new Map<string, number>();
    const pastByCategory = new Map<string, number>();
    for (const row of flows.spend) {
        const key = rollKey(row._id.category);
        if (row._id.month === label) {
            currentByCategory.set(key, (currentByCategory.get(key) ?? 0) + row.total);
        }
        else if (completeLabels.includes(row._id.month)) {
            pastByCategory.set(key, (pastByCategory.get(key) ?? 0) + row.total);
        }
    }
    const toTotals = (byKey: Map<string, number>, divisor = 1): CategoryTotal[] =>
        [...byKey].map(([categoryId, total]) => ({
            categoryId,
            name: rollName(categoryId),
            total: Math.round(total / divisor),
        }));

    // --- Facts, calendar arithmetic done here so the rules never touch a Date -------
    const accountFacts: AccountFact[] = accounts.map((a) => ({
        accountId: String(a._id),
        name: a.name,
        type: a.type,
        balance: a.balance,
    }));

    const budgetFacts = (items: { budget: { category: mongoose.Types.ObjectId; limit: number }; spent: number }[]): BudgetFact[] =>
        items.map(({ budget, spent }) => ({
            categoryId: String(budget.category),
            categoryName: rollName(String(budget.category)),
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

    return {
        currency,
        monthLabel: label,
        daysElapsed,
        daysInMonth,
        accounts: accountFacts,
        budgets: budgetFacts(budgetsNow.items),
        prevBudgets: budgetFacts(budgetsPrev.items),
        bills: billFacts,
        goals: goalFacts,
        healthFocus: health.focus ? { label: health.focus.label, hint: health.focus.hint } : null,
        thisMonth: { income: current.income, expense: current.expense, byCategory: toTotals(currentByCategory) },
        months,
        categoryAverages: toTotals(pastByCategory, monthsAveraged),
    };
};
