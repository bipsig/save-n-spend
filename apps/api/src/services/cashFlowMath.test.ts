import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { projectCashFlow, type ProjectionBill } from "./cashFlowMath";

const ZONE = "Asia/Kolkata";
// 20 Sep 2026, midday in India.
const NOW = new Date("2026-09-20T06:30:00Z");
const ist = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 6, 30));

const bill = (over: Partial<ProjectionBill>): ProjectionBill => ({
    id: "b1",
    name: "Rent",
    amount: 1_500_000,
    dueDate: ist(2026, 10, 3),
    status: "pending",
    recurring: true,
    frequency: "monthly",
    toInvestment: null,
    ...over,
});

const run = (over: Partial<Parameters<typeof projectCashFlow>[0]> = {}) =>
    projectCashFlow({ now: NOW, zone: ZONE, startBalance: 5_000_000, dailySpend: 0, bills: [], income: [], ...over });

const day = (payload: ReturnType<typeof run>, date: string) => payload.days.find((d) => d.date === date)!;

describe("projectCashFlow", () => {
    it("runs from today to the last day of next month", () => {
        const p = run();
        assert.equal(p.days[0].date, "2026-09-20");
        assert.equal(p.days[p.days.length - 1].date, "2026-10-31");
    });

    it("places a monthly bill on each due date in range", () => {
        const p = run({ bills: [bill({ dueDate: ist(2026, 9, 25) })] });
        assert.equal(day(p, "2026-09-25").items.length, 1);
        assert.equal(day(p, "2026-10-25").items.length, 1);
        assert.equal(p.endBalance, 5_000_000 - 2 * 1_500_000);
    });

    it("carries an overdue bill onto today, then continues monthly", () => {
        const p = run({ bills: [bill({ dueDate: ist(2026, 9, 10) })] });
        assert.equal(p.days[0].items[0].overdue, true);
        assert.equal(day(p, "2026-10-10").items.length, 1);
    });

    it("skips a paid one-off and marks a SIP bill as a SIP", () => {
        const p = run({ bills: [
            bill({ id: "paid", recurring: false, status: "paid" }),
            bill({ id: "sip", toInvestment: "inv1", dueDate: ist(2026, 10, 5) }),
        ] });
        const items = p.days.flatMap((d) => d.items);
        assert.equal(items.length, 1);
        assert.equal(items[0].kind, "sip");
    });

    it("expects income a month after it last arrived", () => {
        const p = run({ income: [{ key: "income:salary", title: "Salary", amount: 7_000_000, lastAt: ist(2026, 9, 1), occurrences: 5 }] });
        assert.equal(day(p, "2026-10-01").items[0].kind, "income");
        assert.equal(day(p, "2026-10-01").balance, 12_000_000);
    });

    it("still expects income that's a few days late — on today", () => {
        // Last arrived 15 Aug → expected 15 Sep, 5 days ago.
        const p = run({ income: [{ key: "k", title: "Salary", amount: 100, lastAt: ist(2026, 8, 15), occurrences: 4 }] });
        assert.equal(p.days[0].items.length, 1);
    });

    it("subtracts typical spending on every day but today", () => {
        const p = run({ dailySpend: 10_000 });
        assert.equal(p.days[0].balance, 5_000_000);
        assert.equal(p.days[1].balance, 4_990_000);
    });

    it("reports the lowest point", () => {
        const p = run({
            bills: [bill({ dueDate: ist(2026, 9, 28), amount: 4_800_000 })],
            income: [{ key: "k", title: "Salary", amount: 7_000_000, lastAt: ist(2026, 9, 1), occurrences: 5 }],
        });
        assert.equal(p.lowest.date, "2026-09-28");
        assert.equal(p.lowest.balance, 200_000);
    });
});
