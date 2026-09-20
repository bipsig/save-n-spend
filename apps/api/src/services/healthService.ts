import mongoose from "mongoose";
import Account from "../models/Account";
import Bill, { type IBill } from "../models/Bill";
import Category from "../models/Category";
import Goal, { type IGoal } from "../models/Goal";
import Transaction from "../models/Transaction";
import { daysUntilDue, isSettledForPeriod } from "./billService";
import { budgetProgress } from "./budgetService";
import { formatAmount } from "../utils/money";
import { partsInZone, startOfDayInZone, startOfMonthInZone, addMonthsInZone, addDaysInZone } from "../utils/timezone";

// The financial health score: a weighted sum of five pillars, each reporting its own
// measurement and verdict so every point is attributable.
//
// Two rules worth knowing before changing anything here: a pillar that does not apply is
// not scored (the rest share its weight, see the renormalisation below), and under
// MIN_HISTORY_DAYS of history there is no score at all rather than an invented one.

/** Trailing days the money figures are measured over. Long enough to absorb one irregular
 *  month — a salary landing early, an annual premium — while still responding to a real
 *  change in habits within a few weeks. */
const WINDOW_DAYS = 90;

/** Days of recorded history required before a score is shown at all. */
const MIN_HISTORY_DAYS = 30;

const MS_PER_DAY = 86_400_000;

type PillarKey = "savings" | "buffer" | "bills" | "budgets" | "goals";

// Only what each pillar actually reads, so callers can pass `.lean()` results.
type BillFacts = Pick<IBill, "name" | "dueDate" | "lastPaidAt" | "frequency">;
type GoalFacts = Pick<IGoal, "name" | "target" | "saved" | "deadline" | "createdAt">;
type BudgetFacts = { budget: { limit: number; category: mongoose.Types.ObjectId }; spent: number };

type Pillar = {
    key: PillarKey;
    label: string;
    score: number | null;
    weight: number;
    value: string;
    verdict: string;
    hint?: string;
};

export type HealthScore = {
    score: number | null;
    band: "excellent" | "good" | "fair" | "attention" | "risk" | "unknown";
    rating: string;
    windowDays: number;
    pillars: Pillar[];
    focus?: { key: PillarKey; label: string; hint: string };
    reason?: string;
    /** Raw months of runway, same measurement as the "buffer" pillar's `value` string —
     *  kept alongside it rather than parsed back out of that string, for a dashboard card
     *  that wants the number without duplicating the pillar's own arithmetic. Null exactly
     *  when the pillar itself is null (no spending to measure runway against). */
    runwayMonths: number | null;
};

// Ordered by how much each predicts about someone's finances a year out. Budgets and goals
// sit lower because both are self-set targets — missing one is not the same failure as
// spending more than you earn.
const WEIGHTS: Record<PillarKey, number> = {
    savings: 30,
    buffer: 25,
    bills: 20,
    budgets: 15,
    goals: 10,
};

const BANDS = [
    { min: 80, band: "excellent", rating: "Excellent" },
    { min: 65, band: "good", rating: "Good" },
    { min: 50, band: "fair", rating: "Fair" },
    { min: 35, band: "attention", rating: "Needs attention" },
    { min: 0, band: "risk", rating: "At risk" },
] as const;

/** A score from a table of (measurement, points) anchors, linear between them. Every
 *  pillar's anchors are steeper at the bottom: saving 0% to 5% is a real change, 30% to 35%
 *  is a rounding error, and a straight line would rate them the same. */
const curve = (value: number, anchors: readonly (readonly [number, number])[]): number => {
    const first = anchors[0];
    const last = anchors[anchors.length - 1];
    if (value <= first[0]) return first[1];
    if (value >= last[0]) return last[1];

    for (let i = 1; i < anchors.length; i++) {
        const [x0, y0] = anchors[i - 1];
        const [x1, y1] = anchors[i];
        if (value <= x1) return y0 + ((value - x0) / (x1 - x0)) * (y1 - y0);
    }
    return last[1];
};

/** A pillar's points: whole, 0-100. Rounded HERE and not at the point of display, because the
 *  raw curve output is a full float (84.17309968984512) that leaks into `value`, the verdict
 *  thresholds and the total — so the figure on screen has to be the figure that was scored. */
const points = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

// One vocabulary for all five, so "Watch" means the same thing wherever it appears.
const verdictFor = (score: number): string =>
    score >= 80 ? "On track" : score >= 60 ? "Okay" : score >= 40 ? "Watch" : "Off track";

/** Below this a pillar carries a hint, and is eligible to be the focus. */
const PAR = 65;

/** A pillar this low is not a soft spot, it is a failing grade. */
const CRITICAL = 25;

/** The highest total allowed while any pillar is failing. Without it, strong savings and a
 *  fat buffer carry the headline to "Excellent" while five bills sit a month overdue — the
 *  average is right and the word is wrong, and the word is what the user reads. */
const CRITICAL_CEILING = BANDS[0].min - 1;

const wholeDaysBetween = (from: Date, to: Date, zone: string): number =>
    Math.round((startOfDayInZone(to, zone).getTime() - startOfDayInZone(from, zone).getTime()) / MS_PER_DAY);

const monthYearLabel = (instant: Date, zone: string): string =>
    new Intl.DateTimeFormat("en-IN", { timeZone: zone, month: "short", year: "numeric" }).format(instant);

const pct = (ratio: number): string => `${Math.round(ratio * 100)}%`;

/** What share of income survived the window. 20% is the 50/30/20 target, so it earns 80
 *  rather than full marks; nothing above 30% scores more, or the pillar would reward
 *  austerity. A negative rate is 0 flat. */
const savingsPillar = (income: number, expenses: number): Pillar | null => {
    // No income means no denominator, not a 0% rate — someone living off savings between
    // jobs would otherwise be failing at a thing they aren't doing.
    if (income <= 0) return null;

    const rate = (income - expenses) / income;
    const score = points(curve(rate, [[0, 0], [0.05, 25], [0.2, 80], [0.3, 100]]));

    const monthlyIncome = income / (WINDOW_DAYS / 30);
    const target = Math.round(monthlyIncome * 0.2);

    return {
        key: "savings",
        label: "Savings rate",
        score,
        weight: WEIGHTS.savings,
        value: pct(rate),
        verdict: verdictFor(score),
        hint: score >= PAR
            ? undefined
            : rate <= 0
                ? `You are spending more than you earn over the last ${WINDOW_DAYS} days. Everything else on this list depends on closing that gap first.`
                : `Keeping ${pct(rate)} of what comes in. The usual target is 20% — about ${formatAmount(target)} a month at your income.`,
    };
};

/**
 * How many months of your own spending you could cover from what you hold. Measured against
 * the user's own expense rate: ₹2 lakh is a year of runway for one person and six weeks for
 * another. 3 months is the usual emergency-fund floor, 6 the target, and nothing above 6
 * scores more — this is resilience, not wealth. Card debt is subtracted, since ₹50k in the
 * bank against ₹45k owed is not runway.
 */
const bufferPillar = (
    liquid: number,
    cardDebt: number,
    expenses: number,
): { pillar: Pillar | null; months: number | null } => {
    const monthlyExpense = expenses / (WINDOW_DAYS / 30);

    // No spending, so no runway to be short of — and dividing by it reports Infinity months.
    if (monthlyExpense <= 0) return { pillar: null, months: null };

    const net = Math.max(0, liquid - cardDebt);
    const months = net / monthlyExpense;
    const score = points(curve(months, [[0, 0], [1, 40], [3, 75], [6, 100]]));

    const floor = Math.round(monthlyExpense * 3);

    const pillar: Pillar = {
        key: "buffer",
        label: "Safety buffer",
        score,
        weight: WEIGHTS.buffer,
        value: months >= 6 ? "6+ months" : `${months.toFixed(1)} months`,
        verdict: verdictFor(score),
        hint: score >= PAR
            ? undefined
            : cardDebt > 0 && cardDebt >= liquid * 0.25
                ? `${formatAmount(cardDebt)} on cards is eating most of your buffer. Clearing it lifts this faster than saving more does.`
                : `${formatAmount(net)} on hand covers ${months.toFixed(1)} months. Three months of your own expenses — about ${formatAmount(floor)} — is the usual floor.`,
    };
    return { pillar, months };
};

/**
 * Whether written-down obligations are being met on time. The PRESENT only, and that is a
 * data limitation: a recurring bill is never marked paid — its due date rolls forward — so
 * there is no record of whether last month's was late.
 *
 * Two terms, since "one bill is late" and "late three weeks" differ: the share overdue, then
 * a penalty for the worst one, capped at a month. Amount is not weighted in — the money
 * consequence already shows up in the buffer.
 */
const billsPillar = (bills: BillFacts[], now: Date, zone: string): Pillar | null => {
    if (bills.length === 0) return null;

    const overdue = bills.filter(
        (bill) => !isSettledForPeriod(bill, now, zone) && daysUntilDue(bill.dueDate, now, zone) < 0,
    );

    const daysLate = overdue.map((bill) => -daysUntilDue(bill.dueDate, now, zone));
    const worst = daysLate.length > 0 ? Math.max(...daysLate) : 0;

    const punctuality = 100 * (1 - overdue.length / bills.length);
    const staleness = Math.min(30, worst);
    const score = points(punctuality - staleness);

    const worstBill = overdue[daysLate.indexOf(worst)];

    return {
        key: "bills",
        label: "Bills",
        score,
        weight: WEIGHTS.bills,
        value: overdue.length === 0 ? "All clear" : `${overdue.length} of ${bills.length} late`,
        verdict: verdictFor(score),
        hint: score >= PAR || !worstBill
            ? undefined
            : `${worstBill.name} is ${worst} ${worst === 1 ? "day" : "days"} overdue${overdue.length > 1 ? `, and ${overdue.length - 1} other ${overdue.length === 2 ? "bill is" : "bills are"} late too` : ""}. This is the quickest thing on the list to fix.`,
    };
};

/**
 * Are you living inside the limits you set for yourself. Scored against PACE, not the whole
 * month's limit — on the 5th everybody is under budget, so an unadjusted version reads 100
 * for a fortnight and then collapses. Weighted by limit, because blowing ₹20,000 of
 * groceries is not the same event as blowing ₹500. Zero at 1.5× pace, not 1.0, or the pillar
 * would be binary and jittery.
 */
const budgetsPillar = (
    items: BudgetFacts[],
    names: Map<string, string>,
    now: Date,
    zone: string,
): Pillar | null => {
    const funded = items.filter((item) => item.budget.limit > 0);
    if (funded.length === 0) return null;

    const monthStart = startOfMonthInZone(now, zone);
    const daysInMonth = wholeDaysBetween(monthStart, addMonthsInZone(monthStart, zone, 1), zone);

    // Floored at a week's worth, or day 1 judges a month's spending against one day's
    // allowance and a weekly grocery run reads as a 30× overrun.
    const elapsed = Math.max(7, partsInZone(now, zone).day) / daysInMonth;

    let weighted = 0;
    let weight = 0;
    let over = 0;
    let worstRatio = 0;
    let worstName = "";

    for (const item of funded) {
        const expected = item.budget.limit * elapsed;
        const ratio = item.spent / expected;
        const contribution = curve(ratio, [[1, 100], [1.5, 0]]);

        weighted += contribution * item.budget.limit;
        weight += item.budget.limit;

        if (ratio > 1) over += 1;
        if (ratio > worstRatio) {
            worstRatio = ratio;
            worstName = names.get(String(item.budget.category)) ?? "A category";
        }
    }

    const score = points(weighted / weight);

    return {
        key: "budgets",
        label: "Budgets",
        score,
        weight: WEIGHTS.budgets,
        value: over === 0 ? "Within pace" : `${over} of ${funded.length} over`,
        verdict: verdictFor(score),
        hint: score >= PAR
            ? undefined
            : `${worstName} is running at ${pct(worstRatio)} of its pace for this point in the month. Either the limit is wrong or the spending is — both are worth knowing.`,
    };
};

/**
 * Are the things you said you were saving for actually going to happen. Only goals WITH A
 * DEADLINE are scored — one with no date has no rate to measure against.
 *
 * The measure is a RATE ratio, not completion: what has gone in per month since the goal was
 * created, against what is now needed to land on time. A goal created yesterday at 0% is not
 * failing; one that needed ₹8,000 a month and got ₹3,000 is.
 */
const goalsPillar = (goals: GoalFacts[], now: Date, zone: string): Pillar | null => {
    const committed = goals.filter((goal) => goal.deadline && goal.target > 0);
    if (committed.length === 0) return null;

    let weighted = 0;
    let weight = 0;
    let worstScore = 101;
    let worstHint = "";

    for (const goal of committed) {
        let score: number;
        let hint = "";

        if (goal.saved >= goal.target) {
            score = 100;
        }
        else {
            const daysLeft = wholeDaysBetween(now, goal.deadline as Date, zone);
            // Floored at half a month, so a deadline days away yields a high required rate
            // and a low score — the honest answer for an unfunded goal due Friday.
            const monthsLeft = Math.max(0.5, daysLeft / 30);
            const monthsRunning = Math.max(1, wholeDaysBetween(goal.createdAt, now, zone) / 30);

            const required = (goal.target - goal.saved) / monthsLeft;
            const achieved = goal.saved / monthsRunning;

            score = daysLeft < 0 ? 0 : points((achieved / required) * 100);
            hint = daysLeft < 0
                ? `${goal.name} passed its date at ${pct(goal.saved / goal.target)} funded. Move the deadline or lower the target — a goal you have already missed stops being a plan.`
                : `${goal.name} needs about ${formatAmount(required)} a month to land by ${monthYearLabel(goal.deadline as Date, zone)}. You have been adding roughly ${formatAmount(achieved)}.`;
        }

        weighted += score * goal.target;
        weight += goal.target;

        if (score < worstScore) {
            worstScore = score;
            worstHint = hint;
        }
    }

    const score = points(weighted / weight);

    return {
        key: "goals",
        label: "Goals",
        score,
        weight: WEIGHTS.goals,
        // Pace, not funding: the score IS the pace ratio, and the funded percentage is on
        // every goal card already.
        value: score >= 99 ? "On pace" : `${pct(score / 100)} of pace`,
        verdict: verdictFor(score),
        hint: score >= PAR || !worstHint ? undefined : worstHint,
    };
};

const notEnoughData = (reason: string, windowDays = WINDOW_DAYS): HealthScore => ({
    score: null,
    band: "unknown",
    rating: "Not enough data",
    windowDays,
    pillars: [],
    reason,
    runwayMonths: null,
});

/** The user's financial health score, as of now — never a named month, which is why it is
 *  not part of GET /dashboard/summary: that response's fields would span two windows. */
export const healthScore = async (
    userId: string | mongoose.Types.ObjectId,
    zone: string,
    now: Date = new Date(),
): Promise<HealthScore> => {
    const oid = new mongoose.Types.ObjectId(String(userId));

    // The gate, before any of the work: a brand-new account computes to a devastating score
    // that says nothing about the user.
    const first = await Transaction.findOne({ userId: oid })
        .sort({ occurredAt: 1 })
        .select("occurredAt")
        .lean();

    if (!first) {
        return notEnoughData("Log a few transactions and your score will appear here.");
    }

    const historyDays = wholeDaysBetween(first.occurredAt, now, zone);
    if (historyDays < MIN_HISTORY_DAYS) {
        const left = MIN_HISTORY_DAYS - historyDays;
        return notEnoughData(
            `${left} more ${left === 1 ? "day" : "days"} of history and your score will appear. A verdict on two weeks of spending would not be worth much.`,
        );
    }

    const windowStart = addDaysInZone(startOfDayInZone(now, zone), zone, -WINDOW_DAYS);

    const [flows, balances, bills, goals, budgets, categories] = await Promise.all([
        // `transfer` and the adjustments are excluded: moving money between your own
        // accounts is not income or spending, and a correction is bookkeeping. Both still
        // move `Account.balance`, so they reach the buffer pillar.
        Transaction.aggregate<{ _id: string; total: number }>([
            {
                $match: {
                    userId: oid,
                    type: { $in: ["income", "expense"] },
                    occurredAt: { $gte: windowStart, $lte: now },
                },
            },
            { $group: { _id: "$type", total: { $sum: "$amount" } } },
        ]),
        Account.aggregate<{ _id: string; total: number }>([
            { $match: { userId: oid, isArchived: false } },
            { $group: { _id: "$type", total: { $sum: "$balance" } } },
        ]),
        Bill.find({ userId: oid }, { name: 1, dueDate: 1, lastPaidAt: 1, frequency: 1 }).lean(),
        Goal.find({ userId: oid }, { name: 1, target: 1, saved: 1, deadline: 1, createdAt: 1 }).lean(),
        budgetProgress(oid, zone),
        // Only so the budgets hint can name the category it is about.
        Category.find({ userId: oid }, { name: 1 }).lean(),
    ]);

    const income = flows.find((row) => row._id === "income")?.total ?? 0;
    const expenses = flows.find((row) => row._id === "expense")?.total ?? 0;

    const balanceOf = (type: string): number => balances.find((row) => row._id === type)?.total ?? 0;
    const liquid = balanceOf("bank") + balanceOf("cash") + balanceOf("wallet");
    // A card's balance goes negative as it is used, so debt is the negative part. An
    // overpaid card is not spendable cash, so a positive balance contributes nothing.
    const cardDebt = Math.max(0, -balanceOf("credit_card"));

    const categoryNames = new Map<string, string>(
        categories.map((row) => [String(row._id), row.name]),
    );

    const buffer = bufferPillar(liquid, cardDebt, expenses);

    // Heaviest first, so a pillar never changes position. The dashboard shows the first
    // three that apply; the full list is on the detail screen.
    const pillars = [
        savingsPillar(income, expenses),
        buffer.pillar,
        billsPillar(bills, now, zone),
        budgetsPillar(budgets.items, categoryNames, now, zone),
        goalsPillar(goals, now, zone),
    ].filter((pillar): pillar is Pillar => pillar !== null);

    const scored = pillars.filter((pillar) => pillar.score !== null);
    if (scored.length === 0) {
        return notEnoughData("There isn't enough activity yet to score.");
    }

    // Renormalised over the pillars that apply, rather than scoring an absent one zero and
    // making this a measure of feature adoption. The accepted trade-off is that deleting a
    // budget you are overspending removes its penalty; savings and buffer carry 55% between
    // them and cannot be dodged, both being computed from money that has already moved.
    const totalWeight = scored.reduce((sum, pillar) => sum + pillar.weight, 0);
    const average = Math.round(
        scored.reduce((sum, pillar) => sum + (pillar.score as number) * pillar.weight, 0) / totalWeight,
    );

    // See CRITICAL_CEILING.
    const failing = scored.some((pillar) => (pillar.score as number) < CRITICAL);
    const score = failing ? Math.min(average, CRITICAL_CEILING) : average;

    const band = BANDS.find((entry) => score >= entry.min) ?? BANDS[BANDS.length - 1];

    // The weakest pillar that has something to say. Ties break toward the heavier one,
    // since fixing it is worth more.
    const focus = scored
        .filter((pillar) => pillar.hint)
        .sort((a, b) =>
            (a.score as number) - (b.score as number) || b.weight - a.weight,
        )[0];

    return {
        score,
        band: band.band,
        rating: band.rating,
        windowDays: WINDOW_DAYS,
        pillars,
        focus: focus ? { key: focus.key, label: focus.label, hint: focus.hint as string } : undefined,
        runwayMonths: buffer.months,
    };
};
