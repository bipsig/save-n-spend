import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectRecurring, matchesBill, normalizeTitle, type RecurringInput } from "./recurringMath";

const ZONE = "Asia/Kolkata";
const NOW = new Date("2026-09-20T12:00:00Z");

let seq = 0;
const row = (over: Partial<RecurringInput> & { occurredAt: Date }): RecurringInput => ({
    id: `t${seq++}`,
    type: "expense",
    title: "Netflix",
    amount: 49_900,
    category: "c-subs",
    categoryName: "Subscriptions",
    account: "a-bank",
    split: false,
    ...over,
});

/** One row on `day` of each of the given months of 2026 (1-based). */
const monthly = (months: number[], day: number, over: Partial<RecurringInput> = {}): RecurringInput[] =>
    months.map((m) => row({ occurredAt: new Date(Date.UTC(2026, m - 1, day, 6)), ...over }));

describe("normalizeTitle", () => {
    it("groups case, spacing, digits and punctuation together", () => {
        assert.equal(normalizeTitle("  Netflix #4411 "), "netflix");
        assert.equal(normalizeTitle("NETFLIX"), "netflix");
        assert.equal(normalizeTitle("House   rent - Sept"), "house rent sept");
    });
});

describe("detectRecurring", () => {
    it("finds a steady monthly payment", () => {
        const [p] = detectRecurring(monthly([6, 7, 8, 9], 15), NOW, ZONE);
        assert.equal(p.key, "expense:netflix");
        assert.equal(p.occurrences, 4);
        assert.equal(p.amount, 49_900);
        assert.equal(p.looksLikeSip, false);
        assert.equal(p.transactionIds.length, 4);
    });

    it("needs at least three months", () => {
        assert.equal(detectRecurring(monthly([8, 9], 15), NOW, ZONE).length, 0);
    });

    it("rejects a weekly habit that happens to span months", () => {
        const weekly = [7, 8, 9].flatMap((m) => [1, 8, 15, 22].map((d) =>
            row({ title: "Weekly groceries", occurredAt: new Date(Date.UTC(2026, m - 1, d, 6)) })));
        assert.equal(detectRecurring(weekly, NOW, ZONE).length, 0);
    });

    it("rejects amounts that swing too much", () => {
        const rows = [
            ...monthly([6], 10, { title: "Swiggy order", amount: 40_000 }),
            ...monthly([7], 10, { title: "Swiggy order", amount: 90_000 }),
            ...monthly([8, 9], 10, { title: "Swiggy order", amount: 60_000 }),
        ];
        assert.equal(detectRecurring(rows, NOW, ZONE).length, 0);
    });

    it("tolerates one skipped month", () => {
        assert.equal(detectRecurring(monthly([5, 7, 8, 9], 5), NOW, ZONE).length, 1);
    });

    it("drops a payment that has stopped", () => {
        assert.equal(detectRecurring(monthly([3, 4, 5, 6], 5), NOW, ZONE).length, 0);
    });

    it("flags an investment-looking payment as a SIP", () => {
        const [p] = detectRecurring(monthly([6, 7, 8, 9], 5, { title: "Axis MF SIP", amount: 500_000 }), NOW, ZONE);
        assert.equal(p.looksLikeSip, true);
    });

    it("leaves split members out of the convertible ids", () => {
        const rows = monthly([6, 7, 8, 9], 5);
        rows[1].split = true;
        const [p] = detectRecurring(rows, NOW, ZONE);
        assert.equal(p.transactionIds.length, 3);
        assert.ok(!p.transactionIds.includes(rows[1].id));
    });

    it("finds salary as income with room for a bonus month", () => {
        const rows = [
            ...monthly([6, 7, 9], 1, { type: "income", title: "Monthly salary", amount: 7_000_000 }),
            ...monthly([8], 1, { type: "income", title: "Monthly salary", amount: 8_000_000 }),
        ];
        const [p] = detectRecurring(rows, NOW, ZONE);
        assert.equal(p.kind, "income");
        assert.deepEqual(p.transactionIds, []);
    });
});

describe("detectRecurring — several streams under one title", () => {
    it("finds each steady stream instead of letting them cancel out", () => {
        const rows = [
            ...monthly([6, 7, 8, 9], 1, { type: "income", title: "Monthly salary", amount: 7_000_000 }),
            ...monthly([6, 7, 8, 9], 1, { type: "income", title: "Monthly salary", amount: 8_500_000 }),
        ];
        const found = detectRecurring(rows, NOW, ZONE);
        assert.equal(found.length, 2);
        assert.deepEqual(new Set(found.map((p) => p.key)), new Set(["income:monthly salary", "income:monthly salary:70000"]));
    });

    it("ignores a one-off under the same title as a subscription", () => {
        const rows = [...monthly([6, 7, 8, 9], 15), row({ amount: 399_900, occurredAt: new Date(Date.UTC(2026, 7, 20, 6)) })];
        const found = detectRecurring(rows, NOW, ZONE);
        assert.equal(found.length, 1);
        assert.equal(found[0].amount, 49_900);
    });
});

describe("matchesBill", () => {
    const pattern = { title: "House rent", category: "c-rent", amount: 1_500_000 };

    it("matches on the same name", () => {
        assert.ok(matchesBill({ ...pattern, title: "Netflix" }, [{ name: "netflix", category: null, amount: 1 }]));
    });

    it("matches on category at about the same amount", () => {
        assert.ok(matchesBill(pattern, [{ name: "Rent", category: "c-rent", amount: 1_450_000 }]));
    });

    it("doesn't match the same category at a different amount", () => {
        assert.ok(!matchesBill(pattern, [{ name: "Rent", category: "c-rent", amount: 500_000 }]));
    });
});
