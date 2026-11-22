import { formatAmount, formatPercent } from "../utils/money";
import { duePhrase } from "../utils/duePhrase";
import { isSpendable } from "./accountGroups";
import type { GoalPace } from "./goalPace";

// The highlight rules — the deterministic half of the "assistant". See docs/insights-engine.md.
//
// Two contracts. Every rule is PURE: no I/O, no clock, no mongoose — everything arrives
// precomputed on the snapshot, calendar arithmetic included, because a rule that reads
// `new Date()` answers differently at 11pm than the test saw at noon. And every rule is TOTAL:
// null wherever it has nothing honest to say.

export type HighlightSeverity = "urgent" | "warning" | "notice" | "win";

/** Where tapping the card lands. The client maps these to routes. */
export type HighlightScreen = "budgets" | "bills" | "goals" | "health" | "activity" | "investments";

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
    pace: GoalPace;
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
    /** Trip shares included, as savings count them. */
    expense: number;
    /** The trip part of `expense`. */
    tripExpense: number;
};

export type Snapshot = {
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
    /** `expense` includes trips, `tripExpense` is the trip part; `byCategory` is everyday only. */
    thisMonth: { income: number; expense: number; tripExpense: number; byCategory: CategoryTotal[] };
    /** Complete previous months (up to 3), oldest first. Never partial: comparing a finished
     *  month to a running one flatters whichever is shorter. */
    months: MonthTotals[];
    /** Average paise per complete month, per parent category. */
    categoryAverages: CategoryTotal[];
    /** Consecutive zone-local days with at least one logged transaction, ending today (or
     *  yesterday if today's still in progress). See streakMath.ts. */
    currentStreak: number;
    /** Investment holdings, folded to the few facts the rules need. */
    investments: InvestmentFacts;
    /** Recurring expenses spotted in the history that aren't bills yet. */
    recurring: RecurringFacts;
};

export type RecurringFacts = {
    count: number;
    /** Changes whenever the set of suggestions does — the card's key, so a dismissed card
     *  comes back only when something new is found. */
    signature: string;
    /** The biggest suggestion, for the title. */
    topTitle: string | null;
    topAmount: number;
    /** Σ of every suggestion's monthly amount, paise. */
    monthlyTotal: number;
};

export type InvestmentFacts = {
    hasInvestments: boolean;
    /** Σ current value of all investment accounts, paise. */
    totalValue: number;
    /** Whole days since the most recent value-update, or null if never revalued (or none). */
    daysSinceRevalued: number | null;
    /** Consecutive months (ending this month, or last month if this one's contribution
     *  hasn't landed yet) with at least one contribution. */
    contributionStreakMonths: number;
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

/** Don't nag on day 1 or 2 — three in a row is the first count worth naming. */
const STREAK_MIN_DAYS = 3;
/** Bucketed rather than the raw day-count, so the highlight's `key` is stable across the
 *  days within one bucket — a raw count would mint a new dismissible key every single
 *  day, and the 7-day dismiss-expiry would never mean anything (dismissing "day 5" would
 *  never suppress "day 6" tomorrow regardless). */
const STREAK_MILESTONES = [3, 7, 14, 30, 60, 90, 180, 365];

const MAX_HIGHLIGHTS = 4;

/** Month-to-date spend carried forward at its current daily rate. */
const projectToMonthEnd = (spent: number, snap: Snapshot): number =>
    Math.round((spent / snap.daysElapsed) * snap.daysInMonth);

const perDay = (spent: number, snap: Snapshot): number => Math.round(spent / snap.daysElapsed);

const days = (n: number): string => (n === 1 ? "1 day" : `${n} days`);

const pct = formatPercent;

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
            title: `${fact.categoryName} is on pace to finish ${formatAmount(overrun)} over`,
            body: `${formatAmount(fact.spent)} of ${formatAmount(fact.limit)} spent with ${days(left)} left — about ${formatAmount(perDay(fact.spent, snap))} a day in it.`,
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
            title: `${fact.categoryName} is on track to finish ${formatAmount(headroom)} under`,
            body: `After going over last month, you're pacing about ${formatAmount(perDay(fact.spent, snap))} a day in it.`,
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
        const spendable = snap.accounts.filter((a) => isSpendable(a.type));
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
            title: `${bill.name} is ${duePhrase(bill.daysUntilDue)} and ${account.name} is ${formatAmount(short)} short`,
            body: `The bill is ${formatAmount(bill.amount)}; ${account.name} has ${formatAmount(Math.max(0, account.balance))}.`,
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
            title: `${formatAmount(total)} of bills land in the next ${days(DUE_WINDOW_DAYS)}`,
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
            title: `${move.current.name} is pacing ${formatAmount(move.delta)} above its usual month`,
            body: `${formatAmount(move.current.total)} so far, against a typical ${formatAmount(move.average)} for a whole month.`,
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
            title: `${move.current.name} is pacing ${formatAmount(move.delta)} below its usual month`,
            body: `${formatAmount(move.current.total)} so far, where a typical month runs ${formatAmount(move.average)}.`,
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
        // Savings count trips; a sentence that does says so (D21), when there were any.
        const trips = last.tripExpense > 0;
        return {
            ruleId: "savings_rate_move",
            key: `savings_rate_move:${last.label}`,
            severity: up ? "win" : "notice",
            title: `Your savings rate went from ${pct(prevRate)} to ${pct(lastRate)}`,
            body: up
                ? `You kept ${formatAmount(last.income - last.expense)} of what came in last month${trips ? ", including trips" : ""}.`
                : `Spending${trips ? ", including trips," : ""} grew faster than income last month — worth a look at where.`,
            materiality: Math.round(Math.abs(move) * last.income),
            screen: "activity",
        };
    },
};

/** A goal saving too slowly for its deadline, read through goalPace like Goal watch and the
 *  health score's goals pillar, and named by the shortfall at the current rate. */
const goalPace: Rule = {
    id: "goal_pace",
    run: (snap) => {
        let worst: GoalFact | null = null;
        for (const goal of snap.goals) {
            const { pace } = goal;
            if (pace.done || pace.young || pace.shortfall === null || (pace.monthsLeft ?? 0) < 0) continue;
            // A month's saving or more: an estimate, not a schedule, so a near miss is no alarm.
            if (pace.shortfall === 0 || pace.shortfall < pace.ratePerMonth) continue;
            if (pace.shortfall > (worst?.pace.shortfall ?? 0)) worst = goal;
        }
        if (!worst) return null;

        const goal = worst;
        const shortfall = goal.pace.shortfall ?? 0;
        const monthsLeft = Math.round(goal.pace.monthsLeft ?? 0);
        const pace = goal.pace.monthsNeeded !== null
            ? `At the current pace it needs about ${goal.pace.monthsNeeded} more months; the deadline is ${monthsLeft} away.`
            : `Nothing has gone into it yet.`;
        return {
            ruleId: "goal_pace",
            key: `goal_pace:${goal.name}:${snap.monthLabel}`,
            severity: "warning",
            title: `${goal.name} is set to miss its deadline by ${formatAmount(shortfall)}`,
            body: `${formatAmount(goal.saved)} saved of ${formatAmount(goal.target)}. ${pace}`,
            materiality: shortfall,
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
        // Everyday spending, the same base as the categories it is a share of (D21).
        const { byCategory } = snap.thisMonth;
        const expense = snap.thisMonth.expense - snap.thisMonth.tripExpense;
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
            body: `That's ${formatAmount(catchAll.total)} the breakdown can't explain. Filing those under real categories makes every other number here sharper.`,
            materiality: catchAll.total,
            screen: "activity",
        };
    },
};

const streakMilestone = (n: number): number =>
    [...STREAK_MILESTONES].reverse().find((m) => n >= m) ?? 0;

/**
 * Exported on its own, not only wrapped as a Rule below: the controller needs this
 * exact highlight from a bare day-count during warm-up, before a Snapshot exists to
 * build the Rule interface expects. Zero materiality either way — a streak never
 * outranks a rule with real money at stake, it only fills a quiet day.
 */
export const buildLoggingStreakHighlight = (streakDays: number): Highlight | null => {
    if (streakDays < STREAK_MIN_DAYS) return null;
    const bucket = streakMilestone(streakDays);
    return {
        ruleId: "logging_streak",
        key: `logging_streak:${bucket}`,
        severity: "win",
        title: `${streakDays} day${streakDays === 1 ? "" : "s"} in a row logging transactions`,
        body: "Every day in this streak has at least one entry. Miss a day and it starts over.",
        materiality: 0,
        screen: "activity",
    };
};

const loggingStreak: Rule = {
    id: "logging_streak",
    run: (snap) => buildLoggingStreakHighlight(snap.currentStreak),
};

// Investment rules. All materiality 0 — nudges and celebrations, not money at risk, so
// they rank below anything with rupees on the line and only surface on a quiet day.

/** Values gone stale — a nudge to revalue so net worth and returns stay honest. Only once
 *  there's a revaluation on record to age from; a never-revalued (possibly brand-new)
 *  holding isn't nagged. */
const INVESTMENT_STALE_DAYS = 35;
const investmentStale: Rule = {
    id: "investment_stale",
    run: (snap) => {
        const inv = snap.investments;
        if (!inv.hasInvestments || inv.daysSinceRevalued === null || inv.daysSinceRevalued < INVESTMENT_STALE_DAYS) return null;
        const weeks = Math.round(inv.daysSinceRevalued / 7);
        return {
            ruleId: "investment_stale",
            // Per-month key, so a dismissed nudge can return next month if still stale.
            key: `investment_stale:${snap.monthLabel}`,
            severity: "notice",
            title: `Your investment values are about ${weeks} weeks old`,
            body: "Update what they're worth so your net worth and returns stay accurate.",
            materiality: 0,
            screen: "investments",
        };
    },
};

/** Portfolio crossed a round number. Keyed by the bucket, so it fires once when crossed and
 *  never again for that bucket. Investments have no dashboard banner of their own (unlike net
 *  worth), so this is where the moment is marked. */
const INVESTMENT_MILESTONES = [5_000_00, 10_000_00, 25_000_00, 50_000_00, 100_000_00, 250_000_00, 500_000_00, 1_000_000_00];
const investmentMilestone: Rule = {
    id: "investment_milestone",
    run: (snap) => {
        const v = snap.investments.totalValue;
        if (v <= 0) return null;
        const bucket = [...INVESTMENT_MILESTONES].reverse().find((m) => v >= m);
        if (!bucket) return null;
        return {
            ruleId: "investment_milestone",
            key: `investment_milestone:${bucket}`,
            severity: "win",
            title: `Your investments crossed ${formatAmount(bucket)}`,
            body: `Your portfolio is now worth ${formatAmount(v)}.`,
            materiality: 0,
            screen: "investments",
        };
    },
};

const INVESTING_STREAK_MIN = 3;
const INVESTING_STREAK_MILESTONES = [3, 6, 12, 24, 36, 60];
const investingStreak: Rule = {
    id: "investing_streak",
    run: (snap) => {
        const months = snap.investments.contributionStreakMonths;
        if (months < INVESTING_STREAK_MIN) return null;
        const bucket = [...INVESTING_STREAK_MILESTONES].reverse().find((m) => months >= m) ?? 0;
        return {
            ruleId: "investing_streak",
            key: `investing_streak:${bucket}`,
            severity: "win",
            title: `${months} months of investing in a row`,
            body: "You've added to your investments every month — the habit that does the heavy lifting.",
            materiality: 0,
            screen: "investments",
        };
    },
};

/** Repeating payments that aren't set up as bills yet. Ranked by what they cost a year, so a
 *  big untracked one (rent) earns a slot while a ₹129 subscription doesn't push budget news
 *  off the carousel — the Bills banner and the notification still cover the small ones. */
const recurringFound: Rule = {
    id: "recurring_found",
    run: (snap) => {
        const r = snap.recurring;
        if (r.count === 0 || !r.topTitle) return null;
        return {
            ruleId: "recurring_found",
            key: `recurring_found:${r.signature}`,
            severity: "notice",
            title: r.count === 1
                ? `${r.topTitle} looks like a monthly payment`
                : `${r.count} payments look like they repeat every month`,
            body: r.count === 1
                ? `About ${formatAmount(r.topAmount)} each month. Turn it into a bill to get reminded and see it coming.`
                : `Including ${r.topTitle} (about ${formatAmount(r.topAmount)}). Turn them into bills to get reminded and see them coming.`,
            materiality: r.monthlyTotal * 12,
            screen: "bills",
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
    loggingStreak,
    investmentStale,
    investmentMilestone,
    investingStreak,
    recurringFound,
];

/** For the materiality tiebreak: what to lead with when the rupees are equal. */
const SEVERITY_RANK: Record<HighlightSeverity, number> = { urgent: 0, warning: 1, win: 2, notice: 3 };

/** Every rule over one snapshot, ranked by rupees at stake rather than rule order. Unsliced
 *  — the permanent history (highlightController.ts's logHighlights) needs every rule that
 *  fired, not just the four shown live, so something crowded off the cap still gets
 *  recorded. `runHighlightRules` below is the capped view everything else keeps using. */
export const rankHighlightRules = (snap: Snapshot): Highlight[] =>
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
        .sort((a, b) => b.materiality - a.materiality || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

/** The live view — ranked and capped, beyond four this is a report, not a highlight. An
 *  empty result is a valid answer. */
export const runHighlightRules = (snap: Snapshot): Highlight[] =>
    rankHighlightRules(snap).slice(0, MAX_HIGHLIGHTS);
