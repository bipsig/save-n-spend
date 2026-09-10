import { formatAmount } from "../utils/money";

// The highlight rules — the deterministic half of the "assistant". See docs/insights-engine.md.
//
// Two contracts. Every rule is PURE: no I/O, no clock, no mongoose — everything arrives
// precomputed on the snapshot, calendar arithmetic included, because a rule that reads
// `new Date()` answers differently at 11pm than the test saw at noon. And every rule is TOTAL:
// null wherever it has nothing honest to say.

export type HighlightSeverity = "urgent" | "warning" | "notice" | "win";

/** Where tapping the card lands. The client maps these to routes. */
export type HighlightScreen = "budgets" | "bills" | "goals" | "health" | "activity";

export type Highlight = {
    ruleId: string;
    /** Stable per subject-and-month, so dismissing one doesn't hide the same rule's verdict
     *  about a different budget — or about this one next month. */
    key: string;
    severity: HighlightSeverity;
    /** One line, number included — the part someone reads while scrolling past. */
    title: string;
    /** One or two sentences of why. */
    body: string;
    /** Paise at stake. The ranking signal: rupees first, severity as the tiebreak. */
    materiality: number;
    screen?: HighlightScreen;
};

// Plain facts, scoped to one user and cut in their zone. Calendar arithmetic happens in the
// snapshot service, where the zone lives.

export type AccountFact = {
    accountId: string;
    name: string;
    type: string;
    /** Paise. Credit cards excluded from "can this cover a bill" — owing less is not
     *  having more. */
    balance: number;
};

export type BudgetFact = {
    categoryId: string;
    categoryName: string;
    limit: number;
    /** Paise spent this month, children rolled in. budgetService's number, so a highlight
     *  cannot disagree with the budgets screen. */
    spent: number;
};

/** Only unsettled bills reach the snapshot — a paid bill has nothing to warn about. */
export type BillFact = {
    name: string;
    amount: number;
    /** Zone-local whole days: 0 = today, negative = overdue. */
    daysUntilDue: number;
    accountId: string | null;
};

export type GoalFact = {
    name: string;
    target: number;
    saved: number;
    /** Whole zone-local months since creation — the denominator of its saving rate, same
     *  convention as the health score's goals pillar. */
    monthsSinceCreated: number;
    /** Whole months from now to the deadline, or null when none is set. */
    monthsUntilDeadline: number | null;
};

export type CategoryTotal = {
    categoryId: string;
    name: string;
    /** Paise, children rolled into their parent — the same rollup insights uses. */
    total: number;
};

export type MonthTotals = {
    label: string; // "YYYY-MM"
    income: number;
    expense: number;
};

export type Snapshot = {
    currency: string;
    monthLabel: string;
    /** Zone-local days of the current month, elapsed including today. Always ≥ 1. */
    daysElapsed: number;
    daysInMonth: number;
    accounts: AccountFact[];
    budgets: BudgetFact[];
    /** Last month's budgets with their final spend — what "you went over" means. */
    prevBudgets: BudgetFact[];
    bills: BillFact[];
    goals: GoalFact[];
    /** healthScore()'s own pick of the weakest pillar, verbatim — re-deriving it would give
     *  the app two answers to one question. */
    healthFocus: { label: string; hint: string } | null;
    thisMonth: { income: number; expense: number; byCategory: CategoryTotal[] };
    /** Complete previous months (up to 3), oldest first. Never partial: comparing a finished
     *  month to a running one flatters whichever is shorter. */
    months: MonthTotals[];
    /** Average paise per complete month, per parent category. */
    categoryAverages: CategoryTotal[];
};

type Rule = {
    id: string;
    run: (snap: Snapshot) => Highlight | null;
};

// Every ratio is paired with an absolute rupee floor: a category that went from ₹60 to ₹180
// is up 200% and is not news. All in paise.

/** A projected budget overrun below this isn't worth a card. ₹200. */
const PACE_FLOOR = 20_000;
/** Days that must have passed before a pace projection is trusted — two big days out of
 *  three make a terrifying and meaningless daily rate. */
const MIN_PACE_DAYS = 7;
/** Finishing under this fraction of the limit counts as comfortably under. */
const COMFORT_RATIO = 0.85;
/** A category move (either direction) must clear both of these to fire. ₹500. */
const SPIKE_RATIO = 1.4;
const DROP_RATIO = 0.6;
const MOVE_FLOOR = 50_000;
/** ...and the category's usual month must itself be worth talking about. ₹500. */
const MOVE_MIN_AVERAGE = 50_000;
/** Bills within this many days are "upcoming" for the affordability rules. */
const DUE_WINDOW_DAYS = 7;
/** A cluster is this many bills in the window, or this share of a month's income. */
const CLUSTER_COUNT = 3;
const CLUSTER_INCOME_SHARE = 0.25;
/** Savings-rate move worth naming: five percentage points. */
const RATE_MOVE = 0.05;
/** Share of a month's spending in a catch-all before the breakdown is called blind. */
const CATCH_ALL_SHARE = 0.3;
const CATCH_ALL_MIN_EXPENSE = 200_000; // ₹2,000 — a tiny month is 30% of nothing
/** How a category is recognised as a catch-all, by name. */
const CATCH_ALL_NAMES = new Set(["others", "other", "misc", "miscellaneous", "uncategorised", "uncategorized"]);

const MAX_HIGHLIGHTS = 4;

/** Month-to-date spend carried forward at its current daily rate. */
const projectToMonthEnd = (spent: number, snap: Snapshot): number =>
    Math.round((spent / snap.daysElapsed) * snap.daysInMonth);

const perDay = (spent: number, snap: Snapshot): number => Math.round(spent / snap.daysElapsed);

const days = (n: number): string => (n === 1 ? "1 day" : `${n} days`);

/** "overdue by 2 days" / "due today" / "due tomorrow" / "due in 5 days". */
const duePhrase = (daysUntilDue: number): string => {
    if (daysUntilDue < 0) return `overdue by ${days(-daysUntilDue)}`;
    if (daysUntilDue === 0) return "due today";
    if (daysUntilDue === 1) return "due tomorrow";
    return `due in ${days(daysUntilDue)}`;
};

const pct = (ratio: number): string => `${Math.round(ratio * 100)}%`;

/** A budget on pace to finish over. Allowed to fire before the 80% push would: the push says
 *  a threshold was crossed, this says where the month is heading. */
const budgetPace: Rule = {
    id: "budget_pace",
    run: (snap) => {
        if (snap.daysElapsed < MIN_PACE_DAYS) return null;

        // One card, worst offender — four budgets pacing over is one problem, not four cards.
        let worst: { fact: BudgetFact; overrun: number } | null = null;
        for (const fact of snap.budgets) {
            if (fact.spent <= 0 || fact.limit <= 0) continue;
            const overrun = projectToMonthEnd(fact.spent, snap) - fact.limit;
            if (overrun >= PACE_FLOOR && overrun > (worst?.overrun ?? 0)) worst = { fact, overrun };
        }
        if (!worst) return null;

        const { fact, overrun } = worst;
        const left = snap.daysInMonth - snap.daysElapsed;
        return {
            ruleId: "budget_pace",
            key: `budget_pace:${fact.categoryId}:${snap.monthLabel}`,
            severity: "warning",
            title: `${fact.categoryName} is on pace to finish ${formatAmount(overrun, snap.currency)} over`,
            body: `${formatAmount(fact.spent, snap.currency)} of ${formatAmount(fact.limit, snap.currency)} spent with ${days(left)} left — about ${formatAmount(perDay(fact.spent, snap), snap.currency)} a day in it.`,
            materiality: overrun,
            screen: "budgets",
        };
    },
};

/** A budget breached last month, now pacing comfortably under. Needs last month's failure on
 *  record — "under budget" alone is the normal state. */
const budgetComfortable: Rule = {
    id: "budget_comfortable",
    run: (snap) => {
        if (snap.daysElapsed < MIN_PACE_DAYS) return null;

        const breached = new Map(
            snap.prevBudgets
                .filter((b) => b.limit > 0 && b.spent > b.limit)
                .map((b) => [b.categoryId, b]),
        );
        if (breached.size === 0) return null;

        let best: { fact: BudgetFact; headroom: number } | null = null;
        for (const fact of snap.budgets) {
            if (!breached.has(fact.categoryId) || fact.limit <= 0) continue;
            const projected = projectToMonthEnd(fact.spent, snap);
            if (projected > fact.limit * COMFORT_RATIO) continue;
            const headroom = fact.limit - projected;
            if (headroom > (best?.headroom ?? 0)) best = { fact, headroom };
        }
        if (!best) return null;

        const { fact, headroom } = best;
        return {
            ruleId: "budget_comfortable",
            key: `budget_comfortable:${fact.categoryId}:${snap.monthLabel}`,
            severity: "win",
            title: `${fact.categoryName} is on track to finish ${formatAmount(headroom, snap.currency)} under`,
            body: `After going over last month, you're pacing about ${formatAmount(perDay(fact.spent, snap), snap.currency)} a day in it.`,
            materiality: headroom,
            screen: "budgets",
        };
    },
};

/**
 * The only rule that predicts a payment actually failing, hence the only urgent one. Checked
 * against ONE account — the bill's own, else the largest spendable balance — never the sum,
 * because money in savings is not going to pay a card bill on Thursday.
 */
const billVsBalance: Rule = {
    id: "bill_vs_balance",
    run: (snap) => {
        const spendable = snap.accounts.filter((a) => a.type !== "credit_card");
        if (spendable.length === 0) return null;
        const richest = spendable.reduce((a, b) => (b.balance > a.balance ? b : a));

        let worst: { bill: BillFact; account: AccountFact; short: number } | null = null;
        for (const bill of snap.bills) {
            if (bill.daysUntilDue > DUE_WINDOW_DAYS) continue;
            const account = (bill.accountId && spendable.find((a) => a.accountId === bill.accountId)) || richest;
            const short = bill.amount - account.balance;
            if (short > 0 && bill.amount > (worst?.bill.amount ?? 0)) worst = { bill, account, short };
        }
        if (!worst) return null;

        const { bill, account, short } = worst;
        return {
            ruleId: "bill_vs_balance",
            key: `bill_vs_balance:${bill.name}:${snap.monthLabel}`,
            severity: "urgent",
            title: `${bill.name} is ${duePhrase(bill.daysUntilDue)} and ${account.name} is ${formatAmount(short, snap.currency)} short`,
            body: `The bill is ${formatAmount(bill.amount, snap.currency)}; ${account.name} has ${formatAmount(Math.max(0, account.balance), snap.currency)}.`,
            materiality: bill.amount,
            screen: "bills",
        };
    },
};

/** Several bills landing in the same week — individually fine, together a squeeze. */
const billCluster: Rule = {
    id: "bill_cluster",
    run: (snap) => {
        const upcoming = snap.bills.filter((b) => b.daysUntilDue >= 0 && b.daysUntilDue <= DUE_WINDOW_DAYS);
        if (upcoming.length < 2) return null;

        const total = upcoming.reduce((sum, b) => sum + b.amount, 0);
        // Completed months only. Zero when unknown, which disables the income branch below.
        const monthsWithIncome = snap.months.filter((m) => m.income > 0);
        const usualIncome = monthsWithIncome.length > 0
            ? monthsWithIncome.reduce((sum, m) => sum + m.income, 0) / monthsWithIncome.length
            : 0;

        const heavyByCount = upcoming.length >= CLUSTER_COUNT;
        const heavyByShare = usualIncome > 0 && total >= usualIncome * CLUSTER_INCOME_SHARE;
        if (!heavyByCount && !heavyByShare) return null;

        const named = upcoming
            .slice()
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 2)
            .map((b) => b.name);
        const rest = upcoming.length - named.length;
        return {
            ruleId: "bill_cluster",
            key: `bill_cluster:${snap.monthLabel}`,
            severity: "warning",
            title: `${formatAmount(total, snap.currency)} of bills land in the next ${days(DUE_WINDOW_DAYS)}`,
            body: `${named.join(" and ")}${rest > 0 ? ` and ${rest} more` : ""} — worth checking the balances they'll draw from.`,
            materiality: total,
            screen: "bills",
        };
    },
};

/** Shared body of the spike/drop pair. One rule per direction so severity and copy diverge. */
const biggestCategoryMove = (
    snap: Snapshot,
    direction: "up" | "down",
): { current: CategoryTotal; average: number; delta: number } | null => {
    if (snap.daysElapsed < MIN_PACE_DAYS || snap.categoryAverages.length === 0) return null;

    const averages = new Map(snap.categoryAverages.map((c) => [c.categoryId, c.total]));
    let best: { current: CategoryTotal; average: number; delta: number } | null = null;

    for (const current of snap.thisMonth.byCategory) {
        const average = averages.get(current.categoryId) ?? 0;
        if (average < MOVE_MIN_AVERAGE) continue;

        const projected = projectToMonthEnd(current.total, snap);
        const qualifies = direction === "up"
            ? projected >= average * SPIKE_RATIO
            : projected <= average * DROP_RATIO;
        if (!qualifies) continue;

        const delta = Math.abs(projected - average);
        if (delta >= MOVE_FLOOR && delta > (best?.delta ?? 0)) best = { current, average, delta };
    }
    return best;
};

const categorySpike: Rule = {
    id: "category_spike",
    run: (snap) => {
        const move = biggestCategoryMove(snap, "up");
        if (!move) return null;
        return {
            ruleId: "category_spike",
            key: `category_spike:${move.current.categoryId}:${snap.monthLabel}`,
            severity: "warning",
            title: `${move.current.name} is pacing ${formatAmount(move.delta, snap.currency)} above its usual month`,
            body: `${formatAmount(move.current.total, snap.currency)} so far, against a typical ${formatAmount(move.average, snap.currency)} for a whole month.`,
            materiality: move.delta,
            screen: "activity",
        };
    },
};

const categoryDrop: Rule = {
    id: "category_drop",
    run: (snap) => {
        const move = biggestCategoryMove(snap, "down");
        if (!move) return null;
        return {
            ruleId: "category_drop",
            key: `category_drop:${move.current.categoryId}:${snap.monthLabel}`,
            severity: "win",
            title: `${move.current.name} is pacing ${formatAmount(move.delta, snap.currency)} below its usual month`,
            body: `${formatAmount(move.current.total, snap.currency)} so far, where a typical month runs ${formatAmount(move.average, snap.currency)}.`,
            materiality: move.delta,
            screen: "activity",
        };
    },
};

/** Savings rate, last complete month against the one before. Complete only — a running
 *  month's rate swings with every entry and would have the card flapping. */
const savingsRateMove: Rule = {
    id: "savings_rate_move",
    run: (snap) => {
        if (snap.months.length < 2) return null;
        const [prev, last] = snap.months.slice(-2);
        if (prev.income <= 0 || last.income <= 0) return null;

        const prevRate = (prev.income - prev.expense) / prev.income;
        const lastRate = (last.income - last.expense) / last.income;
        const move = lastRate - prevRate;
        if (Math.abs(move) < RATE_MOVE) return null;

        const up = move > 0;
        return {
            ruleId: "savings_rate_move",
            key: `savings_rate_move:${last.label}`,
            severity: up ? "win" : "notice",
            title: `Your savings rate went from ${pct(prevRate)} to ${pct(lastRate)}`,
            body: up
                ? `You kept ${formatAmount(last.income - last.expense, snap.currency)} of what came in last month.`
                : `Spending grew faster than income last month — worth a look at where.`,
            materiality: Math.round(Math.abs(move) * last.income),
            screen: "activity",
        };
    },
};

/** A goal saving too slowly for its deadline. Rate is saved-per-month-since-created, matching
 *  the health score's goals pillar so the two never disagree. */
const goalPace: Rule = {
    id: "goal_pace",
    run: (snap) => {
        let worst: { goal: GoalFact; monthsNeeded: number } | null = null;
        for (const goal of snap.goals) {
            if (goal.monthsUntilDeadline === null || goal.monthsSinceCreated < 1) continue;
            const remaining = goal.target - goal.saved;
            if (remaining <= 0) continue;

            const rate = goal.saved / goal.monthsSinceCreated;
            const monthsNeeded = rate > 0 ? Math.ceil(remaining / rate) : Infinity;
            // A whole month or more: an estimate, not a schedule, so a near miss is no alarm.
            if (monthsNeeded < goal.monthsUntilDeadline + 1) continue;
            if (remaining > (worst ? worst.goal.target - worst.goal.saved : 0)) worst = { goal, monthsNeeded };
        }
        if (!worst) return null;

        const { goal, monthsNeeded } = worst;
        const remaining = goal.target - goal.saved;
        const pace = Number.isFinite(monthsNeeded)
            ? `At the current pace it needs about ${monthsNeeded} more months; the deadline is ${goal.monthsUntilDeadline} away.`
            : `Nothing has gone into it yet.`;
        return {
            ruleId: "goal_pace",
            key: `goal_pace:${goal.name}:${snap.monthLabel}`,
            severity: "warning",
            title: `${goal.name} is set to miss its deadline by ${formatAmount(remaining, snap.currency)}`,
            body: `${formatAmount(goal.saved, snap.currency)} saved of ${formatAmount(goal.target, snap.currency)}. ${pace}`,
            materiality: remaining,
            screen: "goals",
        };
    },
};

/** The health score's focus pillar, verbatim. Zero materiality, so it ranks last and only
 *  surfaces when the money rules are quiet. */
const healthFocus: Rule = {
    id: "health_focus",
    run: (snap) => {
        if (!snap.healthFocus) return null;
        return {
            ruleId: "health_focus",
            key: `health_focus:${snap.healthFocus.label}:${snap.monthLabel}`,
            severity: "notice",
            title: `${snap.healthFocus.label} is the weakest part of your health score`,
            body: snap.healthFocus.hint,
            materiality: 0,
            screen: "health",
        };
    },
};

/** Too much of the month sitting in a catch-all for the breakdown to mean anything. */
const catchAllHeavy: Rule = {
    id: "catch_all_heavy",
    run: (snap) => {
        const { expense, byCategory } = snap.thisMonth;
        if (expense < CATCH_ALL_MIN_EXPENSE) return null;

        const catchAll = byCategory.find((c) => CATCH_ALL_NAMES.has(c.name.trim().toLowerCase()));
        if (!catchAll) return null;

        const share = catchAll.total / expense;
        if (share < CATCH_ALL_SHARE) return null;

        return {
            ruleId: "catch_all_heavy",
            key: `catch_all_heavy:${catchAll.categoryId}:${snap.monthLabel}`,
            severity: "notice",
            title: `${pct(share)} of this month's spending is in ${catchAll.name}`,
            body: `That's ${formatAmount(catchAll.total, snap.currency)} the breakdown can't explain. Filing those under real categories makes every other number here sharper.`,
            materiality: catchAll.total,
            screen: "activity",
        };
    },
};

const RULES: Rule[] = [
    budgetPace,
    budgetComfortable,
    billVsBalance,
    billCluster,
    categorySpike,
    categoryDrop,
    savingsRateMove,
    goalPace,
    healthFocus,
    catchAllHeavy,
];

/** For the materiality tiebreak: what to lead with when the rupees are equal. */
const SEVERITY_RANK: Record<HighlightSeverity, number> = { urgent: 0, warning: 1, win: 2, notice: 3 };

/** Every rule over one snapshot, ranked by rupees at stake rather than rule order, and capped —
 *  beyond four this is a report, not a highlight. An empty result is a valid answer. */
export const runHighlightRules = (snap: Snapshot): Highlight[] =>
    RULES
        .map((rule) => {
            try {
                return rule.run(snap);
            }
            catch (err) {
                // One bad rule costs one highlight, never the endpoint.
                console.error(`highlight rule ${rule.id} threw`, err);
                return null;
            }
        })
        .filter((h): h is Highlight => h !== null)
        .sort((a, b) => b.materiality - a.materiality || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
        .slice(0, MAX_HIGHLIGHTS);
