import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { averageByDayOfMonth } from "./paceMath";

describe("averageByDayOfMonth", () => {
    it("divides each day by every reference month that has it", () => {
        // Three 30-day months, ₹300 spent on day 1 total, ₹600 on day 15.
        const sumByDay = new Map([[1, 30_000], [15, 60_000]]);
        const months = [{ daysInMonth: 30 }, { daysInMonth: 30 }, { daysInMonth: 30 }];
        const result = averageByDayOfMonth(sumByDay, months);
        assert.equal(result.length, 30);
        assert.equal(result[0], 10_000); // day 1: 30,000 / 3
        assert.equal(result[14], 20_000); // day 15: 60,000 / 3
        assert.equal(result[29], 0); // day 30: nothing spent, still a real zero
    });

    it("divides day 31 only by the months that actually have one", () => {
        // February (28), April (30), and a 31-day month (say January) — day 31 must
        // divide by 1, not 3, or a real ₹100 becomes ₹33 instead.
        const sumByDay = new Map([[31, 10_000]]);
        const months = [{ daysInMonth: 28 }, { daysInMonth: 30 }, { daysInMonth: 31 }];
        const result = averageByDayOfMonth(sumByDay, months);
        assert.equal(result.length, 31);
        assert.equal(result[30], 10_000); // day 31: 10,000 / 1, not / 3
    });

    it("is exactly as long as the longest reference month", () => {
        const result = averageByDayOfMonth(new Map(), [{ daysInMonth: 28 }, { daysInMonth: 31 }]);
        assert.equal(result.length, 31);
    });

    it("returns an empty series with no reference months at all", () => {
        assert.deepEqual(averageByDayOfMonth(new Map(), []), []);
    });
});
