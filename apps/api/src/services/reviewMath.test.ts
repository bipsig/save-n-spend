import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { noSpendDays, bestWorstWeek } from "./reviewMath";

describe("noSpendDays", () => {
    it("subtracts active days from the period's total days", () => {
        assert.equal(noSpendDays(31, 22), 9);
    });

    it("never goes negative even if activeDays somehow exceeds totalDays", () => {
        assert.equal(noSpendDays(28, 30), 0);
    });
});

describe("bestWorstWeek", () => {
    const flat = (n: number, amount: number) =>
        Array.from({ length: n }, (_, i) => ({ date: `d${i}`, amount }));

    it("returns null with fewer than two full weeks", () => {
        assert.equal(bestWorstWeek(flat(13, 1000)), null);
    });

    it("returns null when nothing deviates from the average", () => {
        assert.equal(bestWorstWeek(flat(28, 1000)), null);
    });

    it("calls out a week well below the period average as 'low'", () => {
        // Weeks 1,2,4 spend 7000 each; week 3 spends nothly — average is well above it.
        const daily = [
            ...flat(7, 1000),
            ...flat(7, 1000),
            ...flat(7, 100), // low week: 700 total
            ...flat(7, 1000),
        ];
        const result = bestWorstWeek(daily);
        assert.ok(result);
        assert.equal(result?.kind, "low");
        assert.equal(result?.total, 700);
    });

    it("calls out a week well above the period average as 'high'", () => {
        const daily = [
            ...flat(7, 1000),
            ...flat(7, 5000), // high week: 35,000 total
            ...flat(7, 1000),
            ...flat(7, 1000),
        ];
        const result = bestWorstWeek(daily);
        assert.ok(result);
        assert.equal(result?.kind, "high");
        assert.equal(result?.total, 35_000);
    });

    it("drops a trailing partial week rather than padding it", () => {
        // 4 full weeks (28 days) + 3 leftover days that must not become a fifth window.
        const daily = [...flat(28, 1000), ...flat(3, 999_999)];
        const result = bestWorstWeek(daily);
        assert.equal(result, null);
    });
});
