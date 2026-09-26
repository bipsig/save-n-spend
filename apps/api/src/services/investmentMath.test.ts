import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { annualReturnOf, holdingFlows, xirr, type HoldingFlowsInput } from "./investmentMath";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const near = (actual: number | null, expected: number, tol = 0.001) => {
    assert.ok(actual !== null, "expected a rate");
    assert.ok(Math.abs(actual! - expected) < tol, `${actual} not within ${tol} of ${expected}`);
};

describe("xirr", () => {
    it("is the plain rate for one lump held a year", () => {
        near(xirr([{ amount: -100_000, at: d("2025-01-01") }, { amount: 110_000, at: d("2026-01-01") }]), 0.1);
    });

    it("is negative for a loss", () => {
        near(xirr([{ amount: -100_000, at: d("2025-01-01") }, { amount: 90_000, at: d("2026-01-01") }]), -0.1);
    });

    it("compounds over two years", () => {
        near(xirr([{ amount: -100_000, at: d("2024-01-01") }, { amount: 121_000, at: d("2026-01-01") }]), 0.1, 0.002);
    });

    it("has no answer when money only goes one way", () => {
        assert.equal(xirr([{ amount: -100, at: d("2025-01-01") }, { amount: -100, at: d("2026-01-01") }]), null);
    });

    it("weights later instalments by the shorter time they were in", () => {
        // ₹10k a month for 12 months, worth ₹1.26L at the end — 5% on the total, but the
        // average rupee was in for only about half a year, so it's roughly 9% a year.
        const flows = Array.from({ length: 12 }, (_, k) => ({ amount: -10_000, at: new Date(Date.UTC(2025, k, 1)) }));
        flows.push({ amount: 126_000, at: d("2026-01-01") });
        const rate = xirr(flows)!;
        assert.ok(rate > 0.08 && rate < 0.11, `got ${rate}`);
    });
});

const base = (over: Partial<HoldingFlowsInput>): HoldingFlowsInput => ({
    startingBalance: 0,
    investedSince: null,
    investedHow: null,
    createdAt: d("2026-01-01"),
    contributions: [],
    redemptions: [],
    current: 0,
    now: d("2026-09-01"),
    ...over,
});

describe("holdingFlows", () => {
    it("needs a start date when there's an opening amount", () => {
        assert.equal(holdingFlows(base({ startingBalance: 100_000, current: 90_000 })), null);
    });

    it("doesn't need one when everything went in through the app", () => {
        const flows = holdingFlows(base({ contributions: [{ amount: 5_000, at: d("2026-02-01") }], current: 5_500 }));
        assert.equal(flows?.length, 2);
    });

    it("puts a lump on its start date", () => {
        const flows = holdingFlows(base({ startingBalance: 100_000, investedSince: d("2025-01-01"), investedHow: "lump", current: 90_000 }))!;
        assert.deepEqual(flows[0], { amount: -100_000, at: d("2025-01-01") });
    });

    it("spreads a SIP's opening amount monthly up to when tracking began, to the paisa", () => {
        const flows = holdingFlows(base({ startingBalance: 100_000, investedSince: d("2025-01-01"), investedHow: "sip", current: 90_000 }))!;
        const opening = flows.filter((f) => f.amount < 0);
        assert.equal(opening.length, 12);
        assert.equal(opening.reduce((s, f) => s + f.amount, 0), -100_000);
        assert.deepEqual(opening[11].at, d("2025-12-01"));
    });
});

describe("annualReturnOf", () => {
    const now = d("2026-09-01");

    it("reports a missing start date", () => {
        assert.equal(annualReturnOf(null, now).annualReturnStatus, "noStartDate");
    });

    it("holds back under three months of history", () => {
        const r = annualReturnOf([{ amount: -100, at: d("2026-07-01") }, { amount: 98, at: now }], now);
        assert.equal(r.annualReturnStatus, "tooEarly");
        assert.equal(r.annualReturn, null);
    });

    it("holds back when most of the money went in recently, even if the first payment is old", () => {
        const r = annualReturnOf([
            { amount: -1_000, at: d("2026-01-01") },
            { amount: -50_000, at: d("2026-08-15") },
            { amount: 53_000, at: now },
        ], now);
        assert.equal(r.annualReturnStatus, "tooEarly");
    });

    it("turns the ₹1L → ₹90k SIP into a yearly loss", () => {
        // Spread monthly over 2025, the average rupee was in for about 14 months, so the
        // −10% all-time works out to roughly −9% a year.
        const flows = holdingFlows(base({ startingBalance: 100_000, investedSince: d("2025-01-01"), investedHow: "sip", current: 90_000, now }));
        const r = annualReturnOf(flows, now);
        assert.equal(r.annualReturnStatus, "ok");
        assert.ok(r.annualReturn! < -0.07 && r.annualReturn! > -0.11, `got ${r.annualReturn}`);
    });
});
