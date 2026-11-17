import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { oneDecimalShares } from "./shareMath";

const tenths = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 10);

describe("oneDecimalShares", () => {
    it("parts that make up the whole add up to exactly 100.0", () => {
        // Rounded one by one these are 33.3 each, 99.9 in all.
        assert.deepEqual(oneDecimalShares([1, 1, 1], 3), [33.4, 33.3, 33.3]);
        // Mockup 08's November: everyday spending ₹79,640.20.
        const nov = oneDecimalShares([2_800_000, 1_824_060, 1_290_580, 1_204_000, 845_380], 7_964_020);
        assert.deepEqual(nov, [35.2, 22.9, 16.2, 15.1, 10.6]);
        assert.equal(tenths(nov), 1000);
    });

    it("each share stays within a tenth of its true value", () => {
        const parts = [13_001, 9_999, 7_003, 3_331, 1_111, 17];
        const whole = parts.reduce((a, b) => a + b, 0);
        const shares = oneDecimalShares(parts, whole);
        assert.equal(tenths(shares), 1000);
        parts.forEach((p, i) => assert.ok(Math.abs(shares[i] - (p / whole) * 100) < 0.1 + 1e-9, `${i}`));
    });

    it("parts short of the whole add up to their own rounded share", () => {
        // Two thirds: 66.7, not 66.6.
        assert.deepEqual(oneDecimalShares([1, 1], 3), [33.4, 33.3]);
        assert.deepEqual(oneDecimalShares([1, 0], 4), [25, 0]);
    });

    it("no whole to divide by is all zeros; a negative part counts as nothing", () => {
        assert.deepEqual(oneDecimalShares([5, 5], 0), [0, 0]);
        assert.deepEqual(oneDecimalShares([5], -10), [0]);
        assert.deepEqual(oneDecimalShares([], 10), []);
        assert.deepEqual(oneDecimalShares([10, -5], 10), [100, 0]);
    });

    it("a tie for the spare tenth goes to the earlier part", () => {
        assert.deepEqual(oneDecimalShares([1, 1, 1, 1, 1, 1], 6), [16.7, 16.7, 16.7, 16.7, 16.6, 16.6]);
    });
});
