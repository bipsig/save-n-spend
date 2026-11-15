import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { unresolvedReferences, type BackupDocs } from "./backupReferences";

const id = (n: number) => n.toString(16).padStart(24, "0");
const [BANK, FRIEND, FOOD, GROCERIES, TRIP, EXPENSE, FUND] = [1, 2, 3, 4, 5, 6, 7].map(id);
const OUTSIDE = "f".repeat(24);

const backup = (over: Partial<BackupDocs> = {}): BackupDocs => ({
    preferences: { defaultAccount: BANK },
    accounts: [{ _id: BANK }, { _id: FRIEND }, { _id: FUND }],
    categories: [{ _id: FOOD, parent: null }, { _id: GROCERIES, parent: FOOD }],
    transactions: [
        { _id: id(10), type: "expense", account: BANK, category: GROCERIES },
        { _id: id(11), type: "transfer", account: BANK, toAccount: FUND, category: null },
        { _id: id(12), type: "expense", account: FRIEND, tripId: TRIP, tripExpenseId: EXPENSE },
    ],
    budgets: [{ _id: id(20), category: FOOD }],
    bills: [{ _id: id(30), account: BANK, toInvestment: FUND, category: null }],
    goals: [{ _id: id(40), name: "Trip" }],
    trips: [{ _id: TRIP, members: [FRIEND], plan: { entries: [{ account: FRIEND, amount: 100 }] } }],
    tripExpenses: [{ _id: EXPENSE, tripId: TRIP, category: FOOD, paidBy: FRIEND, paidFrom: null, shares: [{ account: null, amount: 50 }, { account: FRIEND, amount: 50 }] }],
    ...over,
});

describe("unresolvedReferences", () => {
    it("finds nothing when every reference names a document in the backup", () =>
        assert.deepEqual(unresolvedReferences(backup()), []));

    it("allows null, absent and empty references", () =>
        assert.deepEqual(unresolvedReferences(backup({
            preferences: { defaultAccount: null },
            transactions: [{ _id: id(10), type: "income", account: BANK }],
            trips: [{ _id: TRIP, members: [] }],
        })), []));

    it("restores older backups that have no trips at all", () => {
        const { trips: _t, tripExpenses: _e, ...old } = backup({ transactions: [{ _id: id(10), type: "expense", account: BANK }] });
        assert.deepEqual(unresolvedReferences(old), []);
    });

    it("resolves contribution logs against the backup's goals, and allows a file without them", () => {
        assert.deepEqual(unresolvedReferences(backup({ goalContributionLogs: [{ _id: id(50), goalId: id(40), amount: 100 }] })), []);
        assert.deepEqual(unresolvedReferences(backup({ goalContributionLogs: [] })), []);
    });

    it("compares ids without regard to case", () =>
        assert.deepEqual(unresolvedReferences(backup({ preferences: { defaultAccount: BANK.toUpperCase() } })), []));

    const cases: [string, Partial<BackupDocs>, string][] = [
        ["transactions.account", { transactions: [{ _id: id(10), account: OUTSIDE }] }, "accounts"],
        ["transactions.toAccount", { transactions: [{ _id: id(10), account: BANK, toAccount: OUTSIDE }] }, "accounts"],
        ["transactions.category", { transactions: [{ _id: id(10), account: BANK, category: OUTSIDE }] }, "categories"],
        ["transactions.tripId", { transactions: [{ _id: id(10), account: BANK, tripId: OUTSIDE }] }, "trips"],
        ["transactions.tripExpenseId", { transactions: [{ _id: id(10), account: BANK, tripExpenseId: OUTSIDE }] }, "tripExpenses"],
        ["bills.account", { bills: [{ _id: id(30), account: OUTSIDE }] }, "accounts"],
        ["bills.toInvestment", { bills: [{ _id: id(30), toInvestment: OUTSIDE }] }, "accounts"],
        ["bills.category", { bills: [{ _id: id(30), category: OUTSIDE }] }, "categories"],
        ["budgets.category", { budgets: [{ _id: id(20), category: OUTSIDE }] }, "categories"],
        ["categories.parent", { categories: [{ _id: FOOD, parent: OUTSIDE }, { _id: GROCERIES }] }, "categories"],
        ["trips.members", { trips: [{ _id: TRIP, members: [FRIEND, OUTSIDE] }] }, "accounts"],
        ["trips.plan.entries.account", { trips: [{ _id: TRIP, members: [FRIEND], plan: { entries: [{ account: OUTSIDE, amount: 1 }] } }] }, "accounts"],
        ["tripExpenses.tripId", { tripExpenses: [{ _id: EXPENSE, tripId: OUTSIDE, shares: [] }] }, "trips"],
        ["tripExpenses.category", { tripExpenses: [{ _id: EXPENSE, tripId: TRIP, category: OUTSIDE, shares: [] }] }, "categories"],
        ["tripExpenses.paidBy", { tripExpenses: [{ _id: EXPENSE, tripId: TRIP, paidBy: OUTSIDE, shares: [] }] }, "accounts"],
        ["tripExpenses.paidFrom", { tripExpenses: [{ _id: EXPENSE, tripId: TRIP, paidFrom: OUTSIDE, shares: [] }] }, "accounts"],
        ["tripExpenses.shares.account", { tripExpenses: [{ _id: EXPENSE, tripId: TRIP, shares: [{ account: null, amount: 1 }, { account: OUTSIDE, amount: 1 }] }] }, "accounts"],
        ["preferences.defaultAccount", { preferences: { defaultAccount: OUTSIDE } }, "accounts"],
        ["goalContributionLogs.goalId", { goalContributionLogs: [{ _id: id(50), goalId: OUTSIDE, amount: 1 }] }, "goals"],
    ];
    for (const [where, over, target] of cases) {
        it(`reports ${where}`, () => {
            const refs = unresolvedReferences(backup(over));
            const [collection, ...field] = where.split(".");
            assert.deepEqual(refs, [{ collection, field: field.join("."), id: OUTSIDE, target }]);
        });
    }

    it("needs the right collection, not just any id in the file", () =>
        assert.deepEqual(unresolvedReferences(backup({ budgets: [{ _id: id(20), category: BANK }] })),
            [{ collection: "budgets", field: "category", id: BANK, target: "categories" }]));

    it("lists every unresolved reference, not only the first", () =>
        assert.equal(unresolvedReferences(backup({ transactions: [{ _id: id(10), account: OUTSIDE, toAccount: OUTSIDE, category: OUTSIDE }] })).length, 3));
});
