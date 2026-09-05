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

// The financial health score.
//
// One number on the dashboard, and the only thing on that screen that claims to be a
// JUDGEMENT rather than a fact. That raises the bar for it: a total the user cannot
// account for is worse than no total, because the first time it moves for a reason they
// can't see, they stop believing the rest of the screen too.
//
// So the whole thing is built on four rules:
//
//   1. Every point is attributable. The score is a weighted sum of five pillars, each
//      of which reports its own measurement and its own verdict. "62" is never the
//      answer — "62, because your buffer is thin" is.
//   2. A pillar that does not apply is not scored. Nobody loses points for not having
//      set up budgets yet; the remaining pillars share the weight instead.
//   3. It refuses to guess. Under a month of history and there is no score at all —
//      an invented 85 is a lie the user will discover.
//   4. It is measured over 90 days, not this month. See WINDOW_DAYS.

/** Trailing days the money figures are measured over.
 *
 *  One calendar month is what the dashboard shows and the wrong window for a verdict:
 *  a salary landing on the 1st instead of the 31st, an annual insurance premium, or one
 *  laptop is enough to swing a monthly savings rate by tens of points, and a score that
 *  jumps 30 points for a reason the user considers normal is a score they learn to
 *  ignore. A year is the other failure — it is so slow to move that someone who fixes
 *  their spending sees no reward for months and concludes the number is fake.
 *
 *  90 days absorbs one irregular month while still responding to a real change in
 *  habits within a few weeks. */
const WINDOW_DAYS = 90;

/** Days of recorded history required before a score is shown at all. */
const MIN_HISTORY_DAYS = 30;

const MS_PER_DAY = 86_400_000;

type PillarKey = "savings" | "buffer" | "bills" | "budgets" | "goals";

// Only what each pillar actually reads, so the callers below can pass `.lean()` results
// without pretending they are hydrated documents.
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
};

/**
 * Why these five, and why these weights.
 *
 * They are the measures this app has honest data for, ordered by how much they predict
 * about someone's finances a year from now:
 *
 *   savings 30 — the single most predictive number in personal finance. What you keep
 *                out of what you earn determines everything downstream.
 *   buffer  25 — the difference between a bad month being an inconvenience and a
 *                crisis. High weight because it is what makes the other four survivable.
 *   bills   20 — punctuality is the cheapest financial health there is; being late costs
 *                money for no return, so it is the most fixable thing on the list.
 *   budgets 15 — intent versus behaviour. Lower than the three above because a budget
 *                is a self-set target: missing one you set ambitiously is not the same
 *                failure as spending more than you earn.
 *   goals   10 — forward motion. Lowest because it is the most discretionary; someone
 *                with no goals and a 30% savings rate is not unhealthy.
 */
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

/**
 * A score from a table of (measurement, points) anchors, linear between them.
 *
 * Written as a table rather than nested ternaries so the shape of every pillar is
 * readable at a glance and arguable on its merits — which matters, because these
 * anchors are judgement calls and somebody will want to change one.
 *
 * Each pillar's anchors get steeper at the bottom and flatter at the top. That is
 * deliberate: going from saving nothing to saving 5% is a real change in someone's life,
 * and going from 30% to 35% is a rounding error. A straight line would rate them the
 * same and reward the wrong behaviour.
 */
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

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

// One vocabulary for all five, so "Watch" means the same thing wherever it appears.
const verdictFor = (score: number): string =>
    score >= 80 ? "On track" : score >= 60 ? "Okay" : score >= 40 ? "Watch" : "Off track";

/** Below this a pillar carries a hint, and is eligible to be the focus. */
const PAR = 65;

/** A pillar this low is not a soft spot, it is a failing grade. */
const CRITICAL = 25;

/** The highest total allowed while any pillar is failing — the top of "Good".
 *
 *  Without this, the weighted average lets a strong savings rate and a fat buffer carry
 *  the headline to "Excellent" while five bills sit a month overdue. The average is
 *  arithmetically right and the word is wrong, and the word is what the user reads. A
 *  score is only worth having if its headline never contradicts its own contents. */
const CRITICAL_CEILING = BANDS[0].min - 1;

const wholeDaysBetween = (from: Date, to: Date, zone: string): number =>
    Math.round((startOfDayInZone(to, zone).getTime() - startOfDayInZone(from, zone).getTime()) / MS_PER_DAY);

// "Mar 2027" — enough to place a deadline without pretending the day matters.
const monthYearLabel = (instant: Date, zone: string): string =>
    new Intl.DateTimeFormat("en-IN", { timeZone: zone, month: "short", year: "numeric" }).format(instant);

const pct = (ratio: number): string => `${Math.round(ratio * 100)}%`;

// ---------------------------------------------------------------------------
// Pillar 1 — savings rate
// ---------------------------------------------------------------------------

/**
 * What share of income survived the window.
 *
 * Anchors: 20% is the savings rate the 50/30/20 rule targets and the figure most
 * personal-finance guidance converges on, so it earns 80 — a strong pass with headroom
 * left, rather than a perfect score that leaves nothing to aim at. Full marks at 30%,
 * and no more credit above it: past that point the marginal health gain is small and the
 * score would start rewarding austerity rather than health.
 *
 * A negative rate scores 0 flat, with no partial credit. Spending more than you earn is
 * the one state where the score should be unambiguous.
 */
const savingsPillar = (income: number, expenses: number): Pillar | null => {
    // No recorded income means there is no denominator — not a 0% savings rate. Someone
    // living off savings between jobs would otherwise be told they are failing at a
    // thing they are not currently doing.
    if (income <= 0) return null;

    const rate = (income - expenses) / income;
    const score = clamp(curve(rate, [[0, 0], [0.05, 25], [0.2, 80], [0.3, 100]]));

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

// ---------------------------------------------------------------------------
// Pillar 2 — buffer
// ---------------------------------------------------------------------------

/**
 * How many months of your own spending you could cover from what you hold.
 *
 * Measured against YOUR average expense rather than an absolute figure, because ₹2 lakh
 * is a year of runway for one person and six weeks for another, and only the second one
 * is in trouble.
 *
 * Anchors: 1 month earns 40 because the first month is the one that does the most work —
 * it is what turns a broken phone from a debt into an errand. 3 months is the commonly
 * cited floor for an emergency fund, 6 the comfortable target, and nothing above 6
 * scores more: this pillar is about resilience, not wealth, and letting it run away
 * would let a large balance paper over a bad savings rate.
 *
 * Credit card debt is subtracted rather than ignored. ₹50,000 in the bank against
 * ₹45,000 owed on a card is not five months of runway, and a score that said so would
 * be actively misleading at the exact moment it matters.
 */
const bufferPillar = (
    liquid: number,
    cardDebt: number,
    expenses: number,
): Pillar | null => {
    const monthlyExpense = expenses / (WINDOW_DAYS / 30);

    // No recorded spending: there is no runway to be short of, and dividing by it would
    // report Infinity months for anyone with a rupee to their name.
    if (monthlyExpense <= 0) return null;

    const net = Math.max(0, liquid - cardDebt);
    const months = net / monthlyExpense;
    const score = clamp(curve(months, [[0, 0], [1, 40], [3, 75], [6, 100]]));

    const floor = Math.round(monthlyExpense * 3);

    return {
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
};

// ---------------------------------------------------------------------------
// Pillar 3 — bills
// ---------------------------------------------------------------------------

/**
 * Whether the obligations you have written down are being met on time.
 *
 * This pillar measures the PRESENT, not the past, and that is a data limitation rather
 * than a choice: a recurring bill is never marked paid — its due date rolls forward —
 * so once this month's electricity is settled there is no record of whether it was
 * settled late. Only what is overdue right now can be scored.
 *
 * Two terms, because "one bill is late" and "one bill has been late for three weeks" are
 * different situations: the share of bills that are overdue, then a penalty for how
 * overdue the worst one is, capped at a month. Amount is deliberately NOT weighted in —
 * lateness is a habit signal, and the money consequence of a large bill already shows up
 * in the buffer pillar. Counting it twice would double-punish one event.
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
    const score = clamp(punctuality - staleness);

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

// ---------------------------------------------------------------------------
// Pillar 4 — budget adherence
// ---------------------------------------------------------------------------

/**
 * Are you living inside the limits you set for yourself.
 *
 * Scored against PACE, not the whole month's limit. On the 5th everybody is under
 * budget, so an unadjusted version would read 100 for the first fortnight and then
 * collapse — a score that is wrong in a predictable cycle. Comparing spend against
 * `limit × (days elapsed / days in month)` is what makes the pillar mean something
 * on the 5th.
 *
 * Weighted by limit, because blowing a ₹20,000 grocery budget is not the same event as
 * blowing a ₹500 one, and an unweighted average would call them equal.
 *
 * Zero at 1.5× pace rather than at 1.0. A hard cliff the moment you cross a limit would
 * make the pillar binary and jittery — and being a little over a target you invented is
 * not a failure worth 15 points.
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

    // Floored at a week's worth. Without the floor, day 1 judges a whole month's spending
    // against a single day's allowance, and one weekly grocery run reads as a 30× overrun
    // for reasons that have nothing to do with the user's habits.
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

    const score = clamp(weighted / weight);

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

// ---------------------------------------------------------------------------
// Pillar 5 — goals
// ---------------------------------------------------------------------------

/**
 * Are the things you said you were saving for actually going to happen.
 *
 * Only goals WITH A DEADLINE are scored, and that is the whole idea. A goal with no date
 * is an aspiration, and there is no rate it can be measured against — so scoring it
 * would mean punishing someone for writing down something they want, which is the
 * opposite of what the app should do. Attaching a date is what turns it into a
 * commitment, and only commitments are graded.
 *
 * The measure is a RATE ratio, not a completion percentage: what you have been putting
 * away per month since you created the goal, against what you now need per month to
 * land it on time. A goal created yesterday at 0% is not failing; a goal that needed
 * ₹8,000 a month and has been getting ₹3,000 is, and no completion percentage would
 * tell you that.
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
            // Floored at half a month so a deadline days away produces a very high
            // required rate and therefore a low score — which is the honest answer. An
            // unfunded goal due on Friday is not on track.
            const monthsLeft = Math.max(0.5, daysLeft / 30);
            const monthsRunning = Math.max(1, wholeDaysBetween(goal.createdAt, now, zone) / 30);

            const required = (goal.target - goal.saved) / monthsLeft;
            const achieved = goal.saved / monthsRunning;

            score = daysLeft < 0 ? 0 : clamp((achieved / required) * 100);
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

    const score = clamp(weighted / weight);

    return {
        key: "goals",
        label: "Goals",
        score,
        weight: WEIGHTS.goals,
        // Pace, not funding. "29% funded" alongside a score of 100 reads as a
        // contradiction — the reader has no way to know one is a rate and the other a
        // total. Since the score IS the pace ratio, saying so keeps the two consistent,
        // and the funded percentage is already on every goal card where it belongs.
        value: score >= 99 ? "On pace" : `${pct(score / 100)} of pace`,
        verdict: verdictFor(score),
        hint: score >= PAR || !worstHint ? undefined : worstHint,
    };
};

// ---------------------------------------------------------------------------

const notEnoughData = (reason: string, windowDays = WINDOW_DAYS): HealthScore => ({
    score: null,
    band: "unknown",
    rating: "Not enough data",
    windowDays,
    pillars: [],
    reason,
});

/**
 * The user's financial health score, as of now.
 *
 * Always "now", never a named month — which is why this does not live inside
 * GET /dashboard/summary. The summary answers "what happened in August"; this answers
 * "how are you doing", and folding them together would produce one response whose
 * fields were measured over two different spans.
 */
export const healthScore = async (
    userId: string | mongoose.Types.ObjectId,
    zone: string,
    now: Date = new Date(),
): Promise<HealthScore> => {
    const oid = new mongoose.Types.ObjectId(String(userId));

    // The gate, before any of the work. A brand-new account has a 0% savings rate, no
    // buffer and no bills, which would compute to a devastating score that says nothing
    // about the user — so it is refused outright rather than shown with a caveat nobody
    // reads.
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
        // `transfer`, `positiveAdjustment` and `negativeAdjustment` are excluded by this
        // filter, and that asymmetry is intentional: moving money between your own
        // accounts is not income or spending, and a balance correction is bookkeeping —
        // counting either would let a user raise their savings rate without earning or
        // saving anything. Both still move `Account.balance`, so they do reach the
        // buffer pillar, which is where they belong.
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
        // Only so the budgets hint can name the category it is about. Named categories
        // make the difference between "a budget is over" and "Dining out is over".
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

    // Fixed order, heaviest first, so a pillar never changes position on the card. The
    // dashboard shows the first three that apply; the full list is on the detail screen.
    const pillars = [
        savingsPillar(income, expenses),
        bufferPillar(liquid, cardDebt, expenses),
        billsPillar(bills, now, zone),
        budgetsPillar(budgets.items, categoryNames, now, zone),
        goalsPillar(goals, now, zone),
    ].filter((pillar): pillar is Pillar => pillar !== null);

    const scored = pillars.filter((pillar) => pillar.score !== null);
    if (scored.length === 0) {
        return notEnoughData("There isn't enough activity yet to score.");
    }

    // Renormalised over the pillars that apply, rather than scoring an absent pillar as
    // zero. A user who has never opened the budgets screen is not unhealthy, and docking
    // them 15 points for it would make the score a measure of feature adoption.
    //
    // The trade-off, stated plainly: deleting a budget you are overspending removes its
    // penalty. That is accepted. Nobody games their own mirror, and the two pillars that
    // carry 55% between them — savings rate and buffer — cannot be dodged by deleting
    // anything, because they are computed from money that has already moved.
    const totalWeight = scored.reduce((sum, pillar) => sum + pillar.weight, 0);
    const average = Math.round(
        scored.reduce((sum, pillar) => sum + (pillar.score as number) * pillar.weight, 0) / totalWeight,
    );

    // See CRITICAL_CEILING. One failing pillar keeps the headline out of the top band, so
    // the word next to the number cannot disagree with the pillars underneath it.
    const failing = scored.some((pillar) => (pillar.score as number) < CRITICAL);
    const score = failing ? Math.min(average, CRITICAL_CEILING) : average;

    const band = BANDS.find((entry) => score >= entry.min) ?? BANDS[BANDS.length - 1];

    // The weakest pillar that has something to say. Surfaced on its own because this is
    // what makes the number useful: a score with no "so do this" is decoration.
    //
    // Ties break toward the heavier pillar — when the buffer and the goals are both at
    // 40, fixing the buffer is worth 25 points and the goals 10, so that is the one to
    // name.
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
    };
};
