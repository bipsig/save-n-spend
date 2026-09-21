import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runHighlightRules } from "./highlightRules";
import type { Highlight, Snapshot } from "./highlightRules";

// The rules are pure functions from a snapshot to sentences, so every test here is
// a fixture literal and an assertion — no database, no clock, no Express. That is
// the point of the purity rule, and these fixtures are also where the thresholds
// and the copy are pinned: change a floor and the failures show exactly which
// sentences stop firing.
//
// Dates never appear: "15 days into a 30-day month" is stated as numbers, which is
// what makes the suite give the same answer at 11pm on the 31st as it does at noon.

// Mid-month, so the pace rules are past their minimum-days gate by default.
const BASE: Snapshot = {
    currency: "INR",
    monthLabel: "2026-09",
    daysElapsed: 15,
    daysInMonth: 30,
    accounts: [],
    budgets: [],
    prevBudgets: [],
    bills: [],
    goals: [],
    healthFocus: null,
    thisMonth: { income: 0, expense: 0, byCategory: [] },
    months: [],
    categoryAverages: [],
    currentStreak: 0,
    investments: { hasInvestments: false, totalValue: 0, daysSinceRevalued: null, contributionStreakMonths: 0 },
};

const snap = (over: Partial<Snapshot>): Snapshot => ({ ...BASE, ...over });

const byRule = (highlights: Highlight[], ruleId: string): Highlight | undefined =>
    highlights.find((h) => h.ruleId === ruleId);

describe("the runner", () => {
    it("says nothing about an account with nothing to say", () => {
        // An empty list is a valid good answer — no rule may fire on an empty month.
        assert.deepEqual(runHighlightRules(BASE), []);
    });

    it("ranks by rupees at stake and caps the list at four", () => {
        const out = runHighlightRules(snap({
            // ₹12,000 limit, ₹9,700 at day 15 → projects ₹19,400: ₹7,400 over.
            budgets: [{ categoryId: "shopping", categoryName: "Shopping", limit: 1_200_000, spent: 970_000 }],
            // ₹4,200 bill against a ₹3,150 account.
            accounts: [{ accountId: "hdfc", name: "HDFC", type: "bank", balance: 315_000 }],
            bills: [
                { name: "Electricity", amount: 420_000, daysUntilDue: 3, accountId: "hdfc" },
                { name: "Internet", amount: 100_000, daysUntilDue: 4, accountId: null },
                { name: "Water", amount: 80_000, daysUntilDue: 5, accountId: null },
            ],
            healthFocus: { label: "Buffer", hint: "Build one month of expenses." },
            thisMonth: {
                income: 0,
                expense: 800_000,
                byCategory: [{ categoryId: "others", name: "Others", total: 300_000 }],
            },
        }));

        assert.equal(out.length, 4);
        // Materiality descending: the ₹7,400 budget overrun leads.
        assert.equal(out[0].ruleId, "budget_pace");
        for (let i = 1; i < out.length; i++) {
            assert.ok(out[i - 1].materiality >= out[i].materiality, "not sorted by materiality");
        }
        // health_focus carries no rupees, so with four money cards it is the one cut.
        assert.equal(byRule(out, "health_focus"), undefined);
    });
});

describe("budget_pace", () => {
    const budgets = [{ categoryId: "shopping", categoryName: "Shopping", limit: 1_200_000, spent: 970_000 }];

    it("projects month-to-date spend to a month-end overrun", () => {
        const hit = byRule(runHighlightRules(snap({ budgets })), "budget_pace");
        assert.ok(hit);
        assert.equal(hit.severity, "warning");
        assert.equal(hit.materiality, 740_000); // 970000/15*30 − 1200000
        assert.ok(hit.title.includes("Shopping"));
        assert.ok(hit.title.includes("7,400"));
        assert.ok(hit.body.includes("15 days left"));
        assert.equal(hit.key, "budget_pace:shopping:2026-09");
    });

    it("stays quiet in the first week — two big days make a meaningless daily rate", () => {
        const out = runHighlightRules(snap({ budgets, daysElapsed: 5 }));
        assert.equal(byRule(out, "budget_pace"), undefined);
    });

    it("ignores an overrun below the rupee floor", () => {
        // Projects exactly ₹100 over: a ratio breach, but not news.
        const out = runHighlightRules(snap({
            budgets: [{ categoryId: "c", categoryName: "C", limit: 1_000_000, spent: 505_000 }],
        }));
        assert.equal(byRule(out, "budget_pace"), undefined);
    });

    it("names only the worst offender when several budgets are pacing over", () => {
        const out = runHighlightRules(snap({
            budgets: [
                { categoryId: "a", categoryName: "A", limit: 100_000, spent: 80_000 },
                { categoryId: "b", categoryName: "B", limit: 100_000, spent: 200_000 },
            ],
        }));
        const hits = out.filter((h) => h.ruleId === "budget_pace");
        assert.equal(hits.length, 1);
        assert.ok(hits[0].title.startsWith("B "));
    });
});

describe("budget_comfortable", () => {
    const pacingUnder = [{ categoryId: "food", categoryName: "Food & Dining", limit: 1_000_000, spent: 300_000 }];

    it("fires only against last month's breach — under budget alone is not news", () => {
        const quiet = runHighlightRules(snap({ budgets: pacingUnder }));
        assert.equal(byRule(quiet, "budget_comfortable"), undefined);

        const out = runHighlightRules(snap({
            budgets: pacingUnder,
            prevBudgets: [{ categoryId: "food", categoryName: "Food & Dining", limit: 1_000_000, spent: 1_100_000 }],
        }));
        const hit = byRule(out, "budget_comfortable");
        assert.ok(hit);
        assert.equal(hit.severity, "win");
        assert.ok(hit.body.includes("After going over last month"));
    });
});

describe("bill_vs_balance", () => {
    it("checks the bill's own account, not the sum of all of them", () => {
        const out = runHighlightRules(snap({
            accounts: [
                { accountId: "hdfc", name: "HDFC", type: "bank", balance: 315_000 },
                // Plenty of money — in the wrong place. The sum must not save this.
                { accountId: "sbi", name: "Savings", type: "bank", balance: 5_000_000 },
            ],
            bills: [{ name: "Electricity", amount: 420_000, daysUntilDue: 3, accountId: "hdfc" }],
        }));
        const hit = byRule(out, "bill_vs_balance");
        assert.ok(hit);
        assert.equal(hit.severity, "urgent");
        assert.ok(hit.title.includes("Electricity"));
        assert.ok(hit.title.includes("HDFC"));
        assert.ok(hit.title.includes("due in 3 days"));
    });

    it("falls back to the largest spendable balance and never counts a credit card", () => {
        const out = runHighlightRules(snap({
            accounts: [
                { accountId: "cash", name: "Cash", type: "cash", balance: 50_000 },
                { accountId: "card", name: "Card", type: "credit_card", balance: 900_000 },
            ],
            bills: [{ name: "Rent", amount: 800_000, daysUntilDue: 2, accountId: null }],
        }));
        const hit = byRule(out, "bill_vs_balance");
        assert.ok(hit);
        assert.ok(hit.title.includes("Cash"));
    });

    it("ignores bills beyond the week and bills the money covers", () => {
        const out = runHighlightRules(snap({
            accounts: [{ accountId: "a", name: "Bank", type: "bank", balance: 500_000 }],
            bills: [
                { name: "Far away", amount: 900_000, daysUntilDue: 20, accountId: null },
                { name: "Covered", amount: 400_000, daysUntilDue: 2, accountId: null },
            ],
        }));
        assert.equal(byRule(out, "bill_vs_balance"), undefined);
    });
});

describe("bill_cluster", () => {
    it("calls out three bills landing in the same week", () => {
        const out = runHighlightRules(snap({
            bills: [
                { name: "Rent", amount: 1_500_000, daysUntilDue: 2, accountId: null },
                { name: "Electricity", amount: 240_000, daysUntilDue: 4, accountId: null },
                { name: "Internet", amount: 100_000, daysUntilDue: 6, accountId: null },
            ],
        }));
        const hit = byRule(out, "bill_cluster");
        assert.ok(hit);
        assert.equal(hit.materiality, 1_840_000);
        assert.ok(hit.body.includes("Rent and Electricity and 1 more"));
    });

    it("treats two bills worth a quarter of usual income as a cluster too", () => {
        const out = runHighlightRules(snap({
            months: [{ label: "2026-08", income: 5_000_000, expense: 3_000_000 }],
            bills: [
                { name: "Rent", amount: 1_200_000, daysUntilDue: 3, accountId: null },
                { name: "School", amount: 400_000, daysUntilDue: 5, accountId: null },
            ],
        }));
        assert.ok(byRule(out, "bill_cluster"));
    });
});

describe("category_spike and category_drop", () => {
    const categoryAverages = [{ categoryId: "transport", name: "Transportation", total: 400_000 }];

    it("flags a category pacing well above its own recent months", () => {
        const out = runHighlightRules(snap({
            categoryAverages,
            // ₹2,800 at day 15 → projects ₹5,600 against a usual ₹4,000.
            thisMonth: { income: 0, expense: 280_000, byCategory: [{ categoryId: "transport", name: "Transportation", total: 280_000 }] },
        }));
        const hit = byRule(out, "category_spike");
        assert.ok(hit);
        assert.equal(hit.materiality, 160_000);
        assert.ok(hit.title.includes("Transportation"));
    });

    it("calls the same move downward a win", () => {
        const out = runHighlightRules(snap({
            categoryAverages,
            // ₹1,000 at day 15 → projects ₹2,000 against a usual ₹4,000.
            thisMonth: { income: 0, expense: 100_000, byCategory: [{ categoryId: "transport", name: "Transportation", total: 100_000 }] },
        }));
        const hit = byRule(out, "category_drop");
        assert.ok(hit);
        assert.equal(hit.severity, "win");
    });

    it("never fires on a category whose usual month is small — ₹60 to ₹180 is not news", () => {
        const out = runHighlightRules(snap({
            categoryAverages: [{ categoryId: "tiny", name: "Tiny", total: 6_000 }],
            thisMonth: { income: 0, expense: 18_000, byCategory: [{ categoryId: "tiny", name: "Tiny", total: 18_000 }] },
        }));
        assert.equal(byRule(out, "category_spike"), undefined);
    });
});

describe("savings_rate_move", () => {
    it("compares the last two complete months and celebrates a rise", () => {
        const out = runHighlightRules(snap({
            months: [
                { label: "2026-07", income: 5_000_000, expense: 4_600_000 }, // 8%
                { label: "2026-08", income: 5_000_000, expense: 4_050_000 }, // 19%
            ],
        }));
        const hit = byRule(out, "savings_rate_move");
        assert.ok(hit);
        assert.equal(hit.severity, "win");
        assert.ok(hit.title.includes("8%"));
        assert.ok(hit.title.includes("19%"));
        assert.equal(hit.key, "savings_rate_move:2026-08");
    });

    it("stays quiet under five percentage points, and on months with no income", () => {
        const small = runHighlightRules(snap({
            months: [
                { label: "2026-07", income: 5_000_000, expense: 4_000_000 },
                { label: "2026-08", income: 5_000_000, expense: 3_900_000 },
            ],
        }));
        assert.equal(byRule(small, "savings_rate_move"), undefined);

        const noIncome = runHighlightRules(snap({
            months: [
                { label: "2026-07", income: 0, expense: 4_000_000 },
                { label: "2026-08", income: 5_000_000, expense: 3_000_000 },
            ],
        }));
        // Zero income is the divide-by-zero month — silence, not NaN%.
        assert.equal(byRule(noIncome, "savings_rate_move"), undefined);
    });
});

describe("goal_pace", () => {
    it("projects a miss from the saved-per-month rate", () => {
        const out = runHighlightRules(snap({
            // ₹34,000 of ₹80,000 in 8 months → ₹4,250/month → ~11 more needed, 6 left.
            goals: [{ name: "Laptop fund", target: 8_000_000, saved: 3_400_000, monthsSinceCreated: 8, monthsUntilDeadline: 6 }],
        }));
        const hit = byRule(out, "goal_pace");
        assert.ok(hit);
        assert.ok(hit.title.includes("Laptop fund"));
        assert.ok(hit.body.includes("11 more months"));
        assert.equal(hit.materiality, 4_600_000);
    });

    it("leaves alone a goal that is on pace, brand new, or undated", () => {
        const out = runHighlightRules(snap({
            goals: [
                { name: "On pace", target: 1_200_000, saved: 600_000, monthsSinceCreated: 6, monthsUntilDeadline: 12 },
                { name: "New", target: 1_000_000, saved: 0, monthsSinceCreated: 0, monthsUntilDeadline: 3 },
                { name: "Undated", target: 1_000_000, saved: 10_000, monthsSinceCreated: 12, monthsUntilDeadline: null },
            ],
        }));
        assert.equal(byRule(out, "goal_pace"), undefined);
    });
});

describe("health_focus", () => {
    it("passes the health score's own hint through verbatim", () => {
        const hint = "Aim for one month of expenses set aside; three is comfortable.";
        const out = runHighlightRules(snap({ healthFocus: { label: "Buffer", hint } }));
        const hit = byRule(out, "health_focus");
        assert.ok(hit);
        assert.equal(hit.body, hint);
        assert.equal(hit.materiality, 0);
        assert.equal(hit.screen, "health");
    });
});

describe("catch_all_heavy", () => {
    it("flags a month where the catch-all hides a third of the spending", () => {
        const out = runHighlightRules(snap({
            thisMonth: {
                income: 0,
                expense: 800_000,
                byCategory: [
                    { categoryId: "others", name: "Others", total: 300_000 },
                    { categoryId: "food", name: "Food & Dining", total: 500_000 },
                ],
            },
        }));
        const hit = byRule(out, "catch_all_heavy");
        assert.ok(hit);
        assert.ok(hit.title.includes("38%"));
        assert.ok(hit.title.includes("Others"));
    });

    it("ignores small months — 30% of nothing is nothing", () => {
        const out = runHighlightRules(snap({
            thisMonth: {
                income: 0,
                expense: 100_000,
                byCategory: [{ categoryId: "others", name: "Others", total: 90_000 }],
            },
        }));
        assert.equal(byRule(out, "catch_all_heavy"), undefined);
    });
});

describe("logging_streak", () => {
    it("says nothing on day 1 or 2 — three in a row is the first count worth naming", () => {
        const out = runHighlightRules(snap({ currentStreak: 2 }));
        assert.equal(byRule(out, "logging_streak"), undefined);
    });

    it("names the exact day count once it clears the floor", () => {
        const out = runHighlightRules(snap({ currentStreak: 5 }));
        const hit = byRule(out, "logging_streak");
        assert.ok(hit);
        assert.ok(hit.title.includes("5 days"));
        assert.equal(hit.materiality, 0);
        assert.equal(hit.severity, "win");
        assert.equal(hit.screen, "activity");
    });

    it("keys by milestone bucket, not the raw day count — so the dismiss-map's 7-day expiry means something", () => {
        const five = byRule(runHighlightRules(snap({ currentStreak: 5 })), "logging_streak");
        const six = byRule(runHighlightRules(snap({ currentStreak: 6 })), "logging_streak");
        assert.equal(five?.key, six?.key);

        const seven = byRule(runHighlightRules(snap({ currentStreak: 7 })), "logging_streak");
        assert.notEqual(seven?.key, six?.key);
    });
});

describe("investment rules", () => {
    const withInv = (over: Partial<Snapshot["investments"]>) =>
        snap({ investments: { hasInvestments: true, totalValue: 0, daysSinceRevalued: null, contributionStreakMonths: 0, ...over } });

    it("nudges when values are stale, not before, and never without investments", () => {
        assert.equal(byRule(runHighlightRules(withInv({ daysSinceRevalued: 40 })), "investment_stale")?.severity, "notice");
        assert.equal(byRule(runHighlightRules(withInv({ daysSinceRevalued: 20 })), "investment_stale"), undefined);
        // Never revalued (possibly brand-new) is not nagged.
        assert.equal(byRule(runHighlightRules(withInv({ daysSinceRevalued: null })), "investment_stale"), undefined);
        // No investments at all → silent.
        assert.equal(byRule(runHighlightRules(snap({})), "investment_stale"), undefined);
    });

    it("celebrates crossing a portfolio milestone, keyed by bucket", () => {
        const hit = byRule(runHighlightRules(withInv({ totalValue: 120_000_00 })), "investment_milestone");
        assert.equal(hit?.severity, "win");
        // Highest bucket at or below ₹1,20,000 is ₹1,00,000.
        assert.equal(hit?.key, "investment_milestone:10000000");
        // Nothing invested → no milestone.
        assert.equal(byRule(runHighlightRules(withInv({ totalValue: 0 })), "investment_milestone"), undefined);
    });

    it("marks an investing streak of three months or more", () => {
        assert.equal(byRule(runHighlightRules(withInv({ contributionStreakMonths: 4 })), "investing_streak")?.severity, "win");
        assert.equal(byRule(runHighlightRules(withInv({ contributionStreakMonths: 2 })), "investing_streak"), undefined);
    });
});
