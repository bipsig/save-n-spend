import { test } from "node:test";
import assert from "node:assert/strict";
import { goalPace } from "./goalPace";

const ZONE = "Asia/Kolkata";
const NOW = new Date("2026-11-22T06:30:00Z");

test("goalPace: rate per month so far, months needed, what's required and the shortfall at the deadline", () => {
    // ₹30,000 of ₹1,00,000 in 365 days (11.99 months); 365 days left.
    const p = goalPace({ target: 10_000_000, saved: 3_000_000, createdAt: new Date("2025-11-22T06:30:00Z"), deadline: new Date("2027-11-22T06:30:00Z") }, NOW, ZONE);
    assert.equal(Math.round(p.ratePerMonth), 250_171);
    assert.equal(p.monthsNeeded, 28);
    assert.equal(Math.round(p.requiredPerMonth!), 583_733);
    // At the current rate it reaches ₹60,000 of ₹1,00,000 by the deadline.
    assert.equal(p.shortfall, 4_000_000);
    assert.deepEqual([p.done, p.young], [false, false]);
});

test("goalPace: done, young, undated, nothing saved, and a deadline days away", () => {
    assert.equal(goalPace({ target: 100, saved: 100, createdAt: NOW }, NOW, ZONE).done, true);
    assert.equal(goalPace({ target: 100, saved: 0, createdAt: new Date("2026-11-01T06:30:00Z") }, NOW, ZONE).young, true);
    const undated = goalPace({ target: 100, saved: 10, createdAt: new Date("2026-01-01T06:30:00Z"), deadline: null }, NOW, ZONE);
    assert.deepEqual([undated.monthsLeft, undated.requiredPerMonth, undated.shortfall], [null, null, null]);
    const none = goalPace({ target: 100_000, saved: 0, createdAt: new Date("2026-01-01T06:30:00Z"), deadline: new Date("2027-01-01T06:30:00Z") }, NOW, ZONE);
    assert.deepEqual([none.monthsNeeded, none.shortfall], [null, 100_000]);
    // Three days away: needs the whole remainder in half a month's terms, twice it per month.
    const soon = goalPace({ target: 100_000, saved: 0, createdAt: new Date("2026-01-01T06:30:00Z"), deadline: new Date("2026-11-25T06:30:00Z") }, NOW, ZONE);
    assert.equal(soon.requiredPerMonth, 200_000);
});

test("goalPace: a passed deadline has negative months left and the whole remainder short", () => {
    const p = goalPace({ target: 100_000, saved: 40_000, createdAt: new Date("2026-01-01T06:30:00Z"), deadline: new Date("2026-10-22T06:30:00Z") }, NOW, ZONE);
    assert.ok(p.monthsLeft! < 0);
    assert.equal(p.shortfall, 60_000);
});
