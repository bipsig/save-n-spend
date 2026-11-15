import { test } from "node:test";
import assert from "node:assert/strict";
import { checkUser, effectsOf, type UserData } from "./rules";

const U = "u1";
const at = new Date("2026-10-01T10:00:00Z");
const clean = (): UserData => ({
    user: { _id: U, email: "x@example.test", prefs: { defaultAccount: "bank" } },
    accounts: [
        { _id: "bank", userId: U, name: "Bank", type: "bank", balance: 10_000 - 3_000 - 1_000 - 1_000 + 500, startingBalance: 10_000 },
        { _id: "asha", userId: U, name: "Asha", type: "person", balance: 1_000, startingBalance: 0 },
        { _id: "fund", userId: U, name: "Fund", type: "investment", balance: 500, startingBalance: 0 },
    ],
    transactions: [
        { _id: "t1", userId: U, type: "expense", amount: 3_000, account: "bank", category: "food", occurredAt: at },
        { _id: "t2", userId: U, type: "expense", amount: 1_000, account: "bank", category: "food", occurredAt: at, splitGroupId: "g1" },
        { _id: "t3", userId: U, type: "transfer", amount: 1_000, account: "bank", toAccount: "asha", occurredAt: at, splitGroupId: "g1" },
        { _id: "t4", userId: U, type: "transfer", amount: 500, account: "fund", toAccount: "bank", occurredAt: at },
        { _id: "t5", userId: U, type: "positiveAdjustment", amount: 1_000, account: "fund", occurredAt: at },
    ],
    categories: [
        { _id: "food", userId: U, name: "Food", kind: "expense" },
        { _id: "snacks", userId: U, name: "Snacks", kind: "expense", parent: "food" },
    ],
    goals: [{ _id: "g", userId: U, name: "Laptop", target: 5_000, saved: 2_000, createdAt: "2026-10-01" }],
    goalLogs: [{ goalId: "g", amount: 1_500 }, { goalId: "g", amount: 500 }],
    bills: [{ _id: "b", userId: U, name: "Rent", account: "bank", category: "food" }],
    budgets: [{ _id: "bu", userId: U, category: "food", month: "2026-10" }],
    trips: [],
    tripExpenses: [],
});

test("clean data has no problems", () => {
    assert.deepEqual(checkUser(clean()), []);
});

test("effectsOf follows the ledger rules", () => {
    assert.deepEqual(effectsOf({ type: "transfer", amount: 5, account: "a", toAccount: "b" }), [["a", -5], ["b", 5]]);
    assert.deepEqual(effectsOf({ type: "negativeAdjustment", amount: 5, account: "a" }), [["a", -5]]);
});

const only = (d: UserData) => checkUser(d).map((p) => p.invariant);

test("I1: a balance that doesn't add up", () => {
    const d = clean(); d.accounts[0].balance -= 10_000;
    assert.deepEqual(only(d), ["I1"]);
    const inv = clean(); inv.accounts[2].balance = 1; // investments aren't checked by I1
    assert.deepEqual(only(inv), []);
});

test("I2: split rows on different dates or accounts", () => {
    const d = clean(); d.transactions[2].occurredAt = new Date("2026-10-02T10:00:00Z");
    assert.deepEqual(only(d), ["I2"]);
});

test("I3 and I4: trip rows must match the split; a closed trip takes nothing new; one let-go", () => {
    const d = clean();
    d.accounts.push({ _id: "ravi", userId: U, name: "Ravi", type: "person", balance: 0, startingBalance: 0 });
    d.trips.push({ _id: "trip", userId: U, name: "Goa", members: ["ravi"], status: "closed", closedAt: "2026-10-05T00:00:00Z" });
    d.tripExpenses.push({ _id: "e1", userId: U, tripId: "trip", title: "Villa", cost: 2_000, occurredAt: at, createdAt: "2026-10-06T00:00:00Z", paidBy: null, paidFrom: "bank", shares: [{ account: null, amount: 1_000 }, { account: "ravi", amount: 1_000 }] });
    const problems = only(d);
    assert.ok(problems.includes("I3"), "rows missing");
    assert.ok(problems.includes("I4"), "added after close");
    const twice = clean();
    twice.trips.push({ _id: "trip", userId: U, name: "Goa", members: ["asha"], status: "closed", closedAt: at });
    twice.transactions.push(
        { _id: "l1", userId: U, type: "expense", amount: 1_000, account: "asha", tripId: "trip", occurredAt: at, createdAt: "2026-10-01T10:00:00.000Z" },
        { _id: "l2", userId: U, type: "expense", amount: 1_000, account: "asha", tripId: "trip", occurredAt: at, createdAt: "2026-10-01T10:00:00.400Z" },
    );
    twice.accounts[1].balance = -1_000;
    assert.ok(only(twice).includes("I4"));
});

test("I5: goal saved vs its log", () => {
    const d = clean(); d.goals[0].saved = 1_000;
    assert.deepEqual(only(d), ["I5"]);
    const old = clean(); old.goals[0].saved = 1_000; old.goals[0].createdAt = "2026-08-01";
    assert.deepEqual(only(old), [], "goals older than the log aren't checked");
});

test("I6: references to missing, foreign or archived records", () => {
    const d = clean();
    d.accounts[0].isArchived = true; // default account and bill account now archived
    d.transactions[0].category = "someone-elses";
    d.categories[0].isArchived = true; // live child under archived parent
    const what = checkUser(d).filter((p) => p.invariant === "I6").map((p) => p.what).join("\n");
    assert.match(what, /default account is archived/);
    assert.match(what, /bill "Rent".*account is archived/);
    assert.match(what, /expense .*category is missing/);
    assert.match(what, /"Snacks" .* is live under the archived "Food"/);
});

test("I7, I14, I15", () => {
    const d = clean();
    d.categories.push({ _id: "food2", userId: U, name: " food ", kind: "expense" });
    d.accounts[2].balance = -400;
    d.trips.push({ _id: "trip", userId: U, name: "Kerala", members: [], status: "active" });
    const row = { userId: U, tripId: "trip", title: "Boat", cost: 1_000, occurredAt: at, paidBy: null, paidFrom: "bank", shares: [{ account: null, amount: 1_000 }], source: "splitwise", importKey: "k1" };
    d.tripExpenses.push({ _id: "x1", ...row }, { _id: "x2", ...row });
    d.transactions.push(
        { _id: "r1", userId: U, type: "expense", amount: 1_000, account: "bank", occurredAt: at, tripExpenseId: "x1" },
        { _id: "r2", userId: U, type: "expense", amount: 1_000, account: "bank", occurredAt: at, tripExpenseId: "x2" },
    );
    d.accounts[0].balance -= 2_000;
    const problems = only(d);
    assert.ok(problems.includes("I7"));
    assert.ok(problems.includes("I14"));
    assert.ok(problems.includes("I15"));
    assert.ok(!problems.includes("I1"));
});
