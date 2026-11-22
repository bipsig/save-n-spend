import { test } from "node:test";
import assert from "node:assert/strict";
import { shortDay, shortMonth, shortMonthYear } from "./dateLabel";

test("server month labels say Sep, read in the user's zone", () => {
    const at = new Date("2026-09-11T10:00:00Z");
    assert.equal(shortDay(at, "Asia/Kolkata"), "11 Sep");
    assert.equal(shortMonth(at, "Asia/Kolkata"), "Sep");
    assert.equal(shortMonthYear(at, "Asia/Kolkata"), "Sep 2026");
    // 20:00 UTC on 31 Aug is already 1 Sep in Kolkata.
    assert.equal(shortDay(new Date("2026-08-31T20:00:00Z"), "Asia/Kolkata"), "1 Sep");
    assert.equal(shortDay(new Date("2026-08-31T20:00:00Z"), "UTC"), "31 Aug");
});
