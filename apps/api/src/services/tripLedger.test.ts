import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    expensesSignature, isReroute, memberBalances, myShareOf, planLedger, planLetGo, planReroute, planSettlement,
    rerouteKey, simplifyMayMatter, splitEvenly, validatePlan, validateTripExpense,
    type Id, type PlanEntry, type TripExpenseIn, type TripTxn,
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


// A real trip: Udupi. What the ledger says between you and each person (exact), against what
// Splitwise's "simplify debts" tells them to pay. Both add up to the same ₹26,054.53.
const UDUPI_EXACT = new Map<Id, number>([
    ["bipasha", 646_543], ["adrita", 439_901], ["meghana", 453_386],
    ["rishabh", 427_169], ["jay", 407_915], ["mayank", 230_539],
]);
const UDUPI_PLAN: PlanEntry[] = [
    { account: "bipasha", amount: 954_586 }, { account: "adrita", amount: 855_936 }, { account: "meghana", amount: 794_931 },
];
const UDUPI_MEMBERS = [...UDUPI_EXACT.keys()];
const asTxn = (row: { type: string; amount: number; account: string }): TripTxn => row;

describe("matching Splitwise's simplified debts", () => {
    it("accepts the Udupi plan: three people pay, three are routed away", () =>
        assert.equal(validatePlan(UDUPI_PLAN, UDUPI_MEMBERS, UDUPI_EXACT), null));

    it("wants the plan to add up to what you're owed overall", () => {
        const short = [{ account: "bipasha", amount: 954_586 }, { account: "adrita", amount: 855_936 }, { account: "meghana", amount: 794_930 }];
        assert.match(validatePlan(short, UDUPI_MEMBERS, UDUPI_EXACT)!, /add up/);
        assert.match(validatePlan([], UDUPI_MEMBERS, UDUPI_EXACT)!, /add up/);
    });

    it("rejects strangers, repeats and fractions of a paisa", () => {
        assert.match(validatePlan([{ account: "stranger", amount: 0 }], UDUPI_MEMBERS, UDUPI_EXACT)!, /on the trip/);
        assert.match(validatePlan([...UDUPI_PLAN, { account: "bipasha", amount: 0 }], UDUPI_MEMBERS, UDUPI_EXACT)!, /twice/);
        assert.match(validatePlan([{ account: "bipasha", amount: 1.5 }], UDUPI_MEMBERS, UDUPI_EXACT)!, /whole paise/);
    });

    it("moves each balance to the plan, and the moves net to zero", () => {
        const rows = planReroute("t1", UDUPI_PLAN, UDUPI_EXACT, AT);
        const delta = new Map(rows.map((r) => [r.account, r.type === "positiveAdjustment" ? r.amount : -r.amount]));
        assert.equal(delta.get("bipasha"), 308_043);   // owes 3,080.43 more than her own share
        assert.equal(delta.get("adrita"), 416_035);
        assert.equal(delta.get("meghana"), 341_545);
        assert.equal(delta.get("rishabh"), -427_169);  // routed away entirely
        assert.equal(delta.get("jay"), -407_915);
        assert.equal(delta.get("mayank"), -230_539);
        assert.equal([...delta.values()].reduce((a, b) => a + b, 0), 0);
    });

    it("ends with exactly the plan once the rows are counted", () => {
        const rows = planReroute("t1", UDUPI_PLAN, UDUPI_EXACT, AT);
        const after = memberBalances(rows.map(asTxn), UDUPI_MEMBERS);
        for (const [person, was] of UDUPI_EXACT) {
            const planned = UDUPI_PLAN.find((e) => e.account === person)?.amount ?? 0;
            assert.equal(was + (after.get(person) as number), planned, person);
        }
    });

    it("writes nothing for someone already where the plan puts them", () => {
        const rows = planReroute("t1", [{ account: "x", amount: 500 }], new Map([["x", 500], ["y", 0]]), AT);
        assert.deepEqual(rows, []);
    });

    it("handles a plan where you pay someone", () => {
        const exact = new Map<Id, number>([["a", 10_000], ["b", -3_000]]);
        const plan = [{ account: "a", amount: 4_000 }, { account: "b", amount: 3_000 }];
        assert.equal(validatePlan(plan, ["a", "b"], exact), null);
        const after = memberBalances(planReroute("t", plan, exact, AT).map(asTxn), ["a", "b"]);
        assert.equal(10_000 + (after.get("a") as number), 4_000);
        assert.equal(-3_000 + (after.get("b") as number), 3_000);
    });

    it("keys each row by trip and person, so saving again replaces rather than stacks", () => {
        const rows = planReroute("t1", UDUPI_PLAN, UDUPI_EXACT, AT);
        assert.equal(new Set(rows.map((r) => r.clientId)).size, rows.length);
        assert.ok(rows.every((r) => r.clientId === rerouteKey("t1", r.account)));
        assert.ok(rows.every((r) => isReroute(r)));
        assert.equal(isReroute({ clientId: "sw:t1:abc" }), false);
        assert.equal(isReroute({}), false);
    });

    it("a settle-up after the plan reduces the exact and the planned balance together", () => {
        const settle = { type: "transfer", amount: 954_586, account: "bipasha", toAccount: "me" };
        const exactAfter = new Map(UDUPI_EXACT).set("bipasha", 646_543 - 954_586);
        // The plan to re-save would now read: Bipasha pays nothing more.
        const plan = [{ account: "adrita", amount: 855_936 }, { account: "meghana", amount: 794_931 }];
        assert.equal(validatePlan(plan, UDUPI_MEMBERS, exactAfter), null);
        assert.equal(memberBalances([settle], UDUPI_MEMBERS).get("bipasha"), -954_586);
    });
});

describe("expensesSignature", () => {
    const base = [
        { id: "e1", cost: 100_000, paidBy: null, shares: [{ account: null, amount: 50_000 }, { account: "a", amount: 50_000 }] },
        { id: "e2", cost: 40_000, paidBy: "a", shares: [{ account: null, amount: 20_000 }, { account: "a", amount: 20_000 }] },
    ];
    it("ignores order", () => assert.equal(expensesSignature(base), expensesSignature([...base].reverse())));
    it("changes when an expense is added, removed or edited", () => {
        const sig = expensesSignature(base);
        assert.notEqual(sig, expensesSignature(base.slice(0, 1)));
        assert.notEqual(sig, expensesSignature([...base, { id: "e3", cost: 1, paidBy: null, shares: [{ account: null, amount: 1 }] }]));
        assert.notEqual(sig, expensesSignature([{ ...base[0], cost: 100_100 }, base[1]]));
        assert.notEqual(sig, expensesSignature([{ ...base[0], shares: [{ account: null, amount: 60_000 }, { account: "a", amount: 40_000 }] }, base[1]]));
    });
});

describe("simplifyMayMatter", () => {
    const names = { "Sagnik Das": null, Bipasha: "bipasha", Adrita: "adrita" };
    it("is true when someone's exact balance differs from what they owe the group", () => {
        const totals = { "Sagnik Das": 1_700_000, Bipasha: -954_586, Adrita: -745_414 };
        const exact = new Map<Id, number>([["bipasha", 646_543], ["adrita", 745_414]]);
        assert.equal(simplifyMayMatter(totals, exact, names), true);
    });
    it("is false when every exact balance already is the person's net", () => {
        const totals = { "Sagnik Das": 1_700_000, Bipasha: -954_586, Adrita: -745_414 };
        const exact = new Map<Id, number>([["bipasha", 954_586], ["adrita", 745_414]]);
        assert.equal(simplifyMayMatter(totals, exact, names), false);
    });
    it("tolerates rounding, and says no when the file has no totals line", () => {
        const exact = new Map<Id, number>([["bipasha", 954_600]]);
        assert.equal(simplifyMayMatter({ Bipasha: -954_586 }, exact, { Bipasha: "bipasha" }), false);
        assert.equal(simplifyMayMatter(null, exact, { Bipasha: "bipasha" }), false);
    });
});
