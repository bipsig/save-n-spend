import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    memberBalances, myShareOf, planLedger, planLetGo, planSettlement, splitEvenly, validateTripExpense,
    type TripExpenseIn, type TripTxn,
} from "./tripLedger";

const AT = new Date("2025-12-18T10:00:00Z");
const MEMBERS = ["rahul", "priya", "aman"];

const expense = (over: Partial<TripExpenseIn>): TripExpenseIn => ({
    title: "Dinner", occurredAt: AT, category: "food", cost: 400_000,
    paidBy: null, paidFrom: "hdfc",
    shares: [{ account: null, amount: 100_000 }, { account: "rahul", amount: 100_000 }, { account: "priya", amount: 100_000 }, { account: "aman", amount: 100_000 }],
    ...over,
});

describe("validateTripExpense", () => {
    it("accepts a sound expense", () => assert.equal(validateTripExpense(expense({}), MEMBERS), null));
    it("wants the shares to add up", () =>
        assert.match(validateTripExpense(expense({ cost: 399_999 }), MEMBERS)!, /add up/));
    it("wants everyone in the split on the trip", () =>
        assert.match(validateTripExpense(expense({ shares: [{ account: null, amount: 200_000 }, { account: "stranger", amount: 200_000 }] }), MEMBERS)!, /on the trip/));
    it("wants an account when you paid, and a member when a friend did", () => {
        assert.match(validateTripExpense(expense({ paidFrom: null }), MEMBERS)!, /account you paid/);
        assert.match(validateTripExpense(expense({ paidBy: "stranger" }), MEMBERS)!, /on the trip/);
    });
    it("refuses the same person twice", () =>
        assert.match(validateTripExpense(expense({ cost: 200_000, shares: [{ account: "rahul", amount: 100_000 }, { account: "rahul", amount: 100_000 }] }), MEMBERS)!, /twice/));
});

describe("planLedger", () => {
    it("you paid: your share is spending, the rest is owed to you", () => {
        const rows = planLedger(expense({}));
        assert.equal(rows.length, 4);
        assert.deepEqual(rows[0], { type: "expense", amount: 100_000, account: "hdfc", category: "food", title: "Dinner", occurredAt: AT });
        assert.ok(rows.slice(1).every((r) => r.type === "transfer" && r.account === "hdfc" && r.amount === 100_000));
        // Out of your bank: the whole bill.
        assert.equal(rows.reduce((s, r) => s + r.amount, 0), 400_000);
    });

    it("a friend paid: only your share, charged to them", () => {
        const rows = planLedger(expense({ paidBy: "rahul", paidFrom: null, cost: 200_000, shares: [{ account: null, amount: 50_000 }, { account: "rahul", amount: 50_000 }, { account: "priya", amount: 100_000 }] }));
        assert.deepEqual(rows, [{ type: "expense", amount: 50_000, account: "rahul", category: "food", title: "Dinner", occurredAt: AT }]);
    });

    it("a friend paid something you weren't in: nothing to record", () => {
        assert.deepEqual(planLedger(expense({ paidBy: "rahul", paidFrom: null, cost: 100_000, shares: [{ account: "priya", amount: 100_000 }] })), []);
    });

    it("you paid for others only: no spending, all owed", () => {
        const rows = planLedger(expense({ cost: 100_000, shares: [{ account: "rahul", amount: 100_000 }] }));
        assert.deepEqual(rows.map((r) => r.type), ["transfer"]);
        assert.equal(myShareOf([{ account: "rahul", amount: 100_000 }]), 0);
    });
});

describe("splitEvenly", () => {
    it("adds up to the paisa", () => {
        const parts = splitEvenly(212_900, 4);
        assert.deepEqual(parts, [53_225, 53_225, 53_225, 53_225]);
        const odd = splitEvenly(100_001, 3);
        assert.equal(odd.reduce((a, b) => a + b, 0), 100_001);
        assert.deepEqual(odd, [33_334, 33_334, 33_333]);
    });
});

describe("memberBalances", () => {
    it("reads each balance off what the trip did to their account", () => {
        const txns: TripTxn[] = [
            ...planLedger(expense({})), // each friend owes you ₹1,000
            ...planLedger(expense({ paidBy: "rahul", paidFrom: null, cost: 200_000, shares: [{ account: null, amount: 50_000 }, { account: "rahul", amount: 150_000 }] })), // you owe Rahul ₹500
            planSettlement("priya", "hdfc", 100_000, "received", AT, "Priya paid you"), // Priya squares up
        ];
        const b = memberBalances(txns, MEMBERS);
        assert.equal(b.get("rahul"), 50_000);   // 1,000 owed − 500 you owe
        assert.equal(b.get("priya"), 0);
        assert.equal(b.get("aman"), 100_000);
    });

    it("clears to zero after letting a balance go, either way", () => {
        const owedToYou = planLetGo("aman", "Aman", 3_000, AT)!;
        const youOwe = planLetGo("rahul", "Rahul", -2_000, AT)!;
        const b = memberBalances([
            { type: "transfer", amount: 3_000, account: "hdfc", toAccount: "aman" },
            { type: "expense", amount: 2_000, account: "rahul" },
            owedToYou, youOwe,
        ], MEMBERS);
        assert.equal(b.get("aman"), 0);
        assert.equal(b.get("rahul"), 0);
        assert.equal(owedToYou.type, "expense"); // they owed you: part of your share
        assert.equal(youOwe.type, "positiveAdjustment"); // you owed them: a correction
        assert.equal(planLetGo("x", "X", 0, AT), null);
    });
});
