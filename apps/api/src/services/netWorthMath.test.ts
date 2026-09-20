import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reconstructTrend } from "./netWorthMath";

describe("reconstructTrend", () => {
    it("subtracts each month's own delta back to a single boundary", () => {
        // Now sits at ₹10,000. September (the current, partial month) added ₹1,000 net,
        // so the start of September — the end of August — was ₹9,000.
        const totals = reconstructTrend(
            1_000_000,
            [{ key: "2026-09", delta: 100_000 }],
            ["2026-09"],
        );
        assert.deepEqual(totals, [900_000]);
    });

    it("walks back through several months independently, oldest boundary first", () => {
        // June +200, July +300, August +400, September (partial) +100 → now = ₹10,000.
        // Each boundary subtracts every delta from its own month through now, not a
        // running total: start-of-June = 10,000 − (200+300+400+100) = 9,000;
        // start-of-July = 10,000 − (300+400+100) = 9,200; start-of-August = 9,500;
        // start-of-September = 9,900.
        const deltas = [
            { key: "2026-06", delta: 20_000 },
            { key: "2026-07", delta: 30_000 },
            { key: "2026-08", delta: 40_000 },
            { key: "2026-09", delta: 10_000 },
        ];
        const totals = reconstructTrend(1_000_000, deltas, ["2026-06", "2026-07", "2026-08", "2026-09"]);
        assert.deepEqual(totals, [900_000, 920_000, 950_000, 990_000]);
    });

    it("treats a month with no matching delta row as zero movement", () => {
        // No transactions at all in September — the boundary is just the current total.
        const totals = reconstructTrend(500_000, [], ["2026-09"]);
        assert.deepEqual(totals, [500_000]);
    });

    it("is unaffected by a delta from a month strictly before the boundary", () => {
        // A stray May row (before the earliest boundary asked for) must not get pulled
        // into June's sum — string comparison against the boundary key is the guard.
        const deltas = [
            { key: "2026-05", delta: 999_999 },
            { key: "2026-06", delta: 10_000 },
        ];
        const totals = reconstructTrend(1_000_000, deltas, ["2026-06"]);
        assert.deepEqual(totals, [990_000]);
    });
});
