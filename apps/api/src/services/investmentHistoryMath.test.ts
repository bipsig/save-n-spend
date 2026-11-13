import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { holdingTrend, portfolioTrend, type HoldingRecords } from "./investmentHistoryMath";

const IST = "Asia/Kolkata";
const at = (iso: string) => new Date(iso);
const NOW = at("2026-11-13T12:00:00+05:30");

// Three real holdings (paise), added on 26 Sep. The value typed when adding is not an entry of its
// own, so each balance holds an opening gain the dated records don't explain.
const ICICI: HoldingRecords = {
    id: "icici", name: "ICICI Pru Flexi Cap",
    startingBalance: 6_000_000, balance: 6_586_000, createdAt: at("2026-09-26T10:00:00+05:30"),
    flows: [{ at: at("2026-10-12T10:00:00+05:30"), amount: 500_000 }],
    updates: [{ at: at("2026-10-21T10:00:00+05:30"), amount: -268_381 }],
};
const PPF: HoldingRecords = {
    id: "ppf", name: "ICICI PPF Account",
    startingBalance: 12_200_000, balance: 13_550_300, createdAt: at("2026-09-26T10:00:00+05:30"),
    flows: [{ at: at("2026-10-05T10:00:00+05:30"), amount: 1_000_000 }],
    updates: [],
};
const FRANKLIN: HoldingRecords = {
    id: "franklin", name: "Franklin Flexi Cap",
    startingBalance: 25_000_000, balance: 24_394_758, createdAt: at("2026-09-26T10:00:00+05:30"),
    flows: [{ at: at("2026-10-23T10:00:00+05:30"), amount: 1_000_000 }],
    updates: [
        { at: at("2026-10-21T10:00:00+05:30"), amount: -500_000 },
        { at: at("2026-10-23T12:00:00+05:30"), amount: -498_928 },
    ],
};
const ALL = [ICICI, PPF, FRANKLIN];

describe("holdingTrend", () => {
    it("ends exactly on today's balance, for every holding", () => {
        for (const h of ALL) {
            const t = holdingTrend(h, IST, NOW);
            assert.equal(t.points[t.points.length - 1].value, h.balance, h.name);
            assert.equal(t.points[t.points.length - 1].invested, h.startingBalance + h.flows.reduce((s, f) => s + f.amount, 0), h.name);
        }
    });

    it("starts the day it was added, with the value that was typed then", () => {
        const t = holdingTrend(ICICI, IST, NOW);
        assert.deepEqual(t.points.map((p) => p.month), ["2026-09", "2026-10", "2026-11"]);
        assert.equal(t.points[0].invested, 6_000_000);
        assert.equal(t.points[0].value, 6_354_381);   // ₹63,543.81 — the opening value, recovered
        assert.equal(t.points[0].upd, true);
    });

    it("counts a month's contributions and updates", () => {
        const t = holdingTrend(ICICI, IST, NOW);
        assert.equal(t.points[1].contrib, 500_000);
        assert.equal(t.points[1].upd, true);
        assert.equal(t.points[1].value, 6_586_000);
    });

    it("carries the last gain forward when nobody updated, and says so", () => {
        const t = holdingTrend(PPF, IST, NOW);
        assert.deepEqual(t.points.map((p) => p.upd), [true, false, false]);
        // 3,503 of gain stays 3,503 while ₹10,000 of new money counts at cost.
        assert.equal(t.points[1].value - t.points[1].invested, 350_300);
        assert.equal(t.points[2].value - t.points[2].invested, 350_300);
        assert.equal(t.monthsSinceUpdate, 2);
    });

    it("marks only the current month as partial", () => {
        const t = holdingTrend(ICICI, IST, NOW);
        assert.deepEqual(t.points.map((p) => !!p.partial), [false, false, true]);
    });

    it("measures growth as the change in gain, never the money added", () => {
        const t = holdingTrend(ICICI, IST, NOW);
        assert.equal(t.growth[0].growth, null);
        assert.equal(t.growth[0].opening, true);
        assert.equal(t.growth[1].growth, -268_381);  // the October value update
        assert.equal(t.growth[2].growth, 0);
        assert.equal(t.growth[2].upd, false);
        // October: ₹5,000 added, so the ₹2,684 fall is measured against ₹68,544 working, not ₹63,544.
        assert.equal(t.growth[1].pct?.toFixed(2), (-268_381 / (6_354_381 + 500_000) * 100).toFixed(2));
    });

    it("growth adds up to how far the gain has moved since the opening", () => {
        for (const h of ALL) {
            const t = holdingTrend(h, IST, NOW);
            const grown = t.growth.reduce((s, g) => s + (g.growth ?? 0), 0);
            const first = t.points[0], last = t.points[t.points.length - 1];
            assert.equal(grown, (last.value - last.invested) - (first.value - first.invested), h.name);
        }
    });

    it("books an update after a gap in the month it was made, and says how many months it covers", () => {
        const h: HoldingRecords = {
            id: "x", name: "X", startingBalance: 1_000_000, balance: 1_150_000, createdAt: at("2026-01-10T10:00:00+05:30"),
            flows: [], updates: [{ at: at("2026-05-15T10:00:00+05:30"), amount: 150_000 }],
        };
        const t = holdingTrend(h, IST, at("2026-06-20T12:00:00+05:30"));
        assert.deepEqual(t.points.map((p) => p.upd), [true, false, false, false, true, false]);
        assert.equal(t.growth[4].growth, 150_000);
        assert.equal(t.growth[4].cover, 4);       // Feb–May, after January
        assert.equal(t.growth[5].cover, 0);
        assert.deepEqual(t.growth.slice(1, 4).map((g) => g.growth), [0, 0, 0]);
    });

    it("reads month boundaries in the user's zone", () => {
        // 31 Oct 19:00 UTC is already 1 Nov in India, still October in UTC.
        const h: HoldingRecords = {
            id: "z", name: "Z", startingBalance: 100_000, balance: 110_000, createdAt: at("2026-09-01T10:00:00Z"),
            flows: [], updates: [{ at: at("2026-10-31T19:00:00Z"), amount: 10_000 }],
        };
        const now = at("2026-11-13T10:00:00Z");
        const india = holdingTrend(h, IST, now), utc = holdingTrend(h, "UTC", now);
        assert.deepEqual(india.points.map((p) => [p.month, p.upd]), [["2026-09", true], ["2026-10", false], ["2026-11", true]]);
        assert.deepEqual(utc.points.map((p) => [p.month, p.upd]), [["2026-09", true], ["2026-10", true], ["2026-11", false]]);
    });

    it("takes money out of both lines together, without moving growth", () => {
        const h: HoldingRecords = {
            id: "r", name: "R", startingBalance: 1_000_000, balance: 880_000, createdAt: at("2026-09-02T10:00:00+05:30"),
            flows: [{ at: at("2026-10-10T10:00:00+05:30"), amount: -200_000 }], updates: [{ at: at("2026-10-12T10:00:00+05:30"), amount: 80_000 }],
        };
        const t = holdingTrend(h, IST, NOW);
        assert.equal(t.points[1].invested, 800_000);
        assert.equal(t.points[1].value, 880_000);
        assert.equal(t.growth[1].growth, 80_000);
        assert.equal(t.points[1].contrib, -200_000);
    });

    it("starts at the earliest record when something was logged before it was added", () => {
        const h: HoldingRecords = {
            id: "b", name: "B", startingBalance: 500_000, balance: 600_000, createdAt: at("2026-10-10T10:00:00+05:30"),
            flows: [{ at: at("2026-08-15T10:00:00+05:30"), amount: 100_000 }], updates: [],
        };
        const t = holdingTrend(h, IST, NOW);
        assert.equal(t.points[0].month, "2026-08");
        assert.equal(t.points[t.points.length - 1].value, 600_000);
    });

    it("includes a future-dated record in today's point, so it matches the balance", () => {
        const h: HoldingRecords = { ...PPF, id: "f", flows: [...PPF.flows, { at: at("2026-12-01T10:00:00+05:30"), amount: 100_000 }], balance: PPF.balance + 100_000 };
        const t = holdingTrend(h, IST, NOW);
        assert.equal(t.points[t.points.length - 1].value, h.balance);
    });

    it("draws a single point for a holding added this month", () => {
        const h: HoldingRecords = { id: "n", name: "N", startingBalance: 100_000, balance: 120_000, createdAt: at("2026-11-02T10:00:00+05:30"), flows: [], updates: [] };
        const t = holdingTrend(h, IST, NOW);
        assert.equal(t.points.length, 1);
        assert.equal(t.points[0].value, 120_000);
        assert.equal(t.points[0].partial, true);
        assert.deepEqual(t.growth.map((g) => g.opening), [true]);
        assert.equal(t.monthsSinceUpdate, 0);
    });

    it("lists updates newest first, with the value each left it at", () => {
        const t = holdingTrend(FRANKLIN, IST, NOW);
        assert.equal(t.updates.length, 2);
        assert.equal(t.updates[0].change, -498_928);
        assert.equal(t.updates[0].value, FRANKLIN.balance);        // the last update leaves it at today's value
        assert.equal(t.updates[1].change, -500_000);
        assert.equal(t.updates[1].value, 25_000_000 + (-606_314 - 500_000));  // before the ₹10,000 went in
        assert.equal(t.lastUpdatedAt, at("2026-10-23T12:00:00+05:30").toISOString());
        assert.equal(holdingTrend(PPF, IST, NOW).lastUpdatedAt, null);
    });
});

describe("portfolioTrend", () => {
    it("has no history without holdings", () => {
        const t = portfolioTrend([], IST, NOW);
        assert.deepEqual([t.points, t.growth, t.holdings], [[], [], []]);
    });

    it("adds the holdings up, month by month, ending on the sum of today's balances", () => {
        const t = portfolioTrend(ALL, IST, NOW);
        const last = t.points[t.points.length - 1];
        assert.equal(last.value, ALL.reduce((s, h) => s + h.balance, 0));
        assert.equal(last.invested, 45_700_000 + 0);   // ₹4,57,000 put in
        assert.equal(last.value - last.invested, -1_168_942);   // ₹11,689.42 below what was put in
        assert.deepEqual(last.parts.map((p) => p.id), ["icici", "ppf", "franklin"]);
    });

    it("says how many holdings had their value given in a month", () => {
        const t = portfolioTrend(ALL, IST, NOW);
        assert.deepEqual(t.points.map((p) => [p.updated, p.existing]), [[3, 3], [2, 3], [0, 3]]);
        assert.deepEqual(t.points.map((p) => p.upd), [true, true, false]);
    });

    it("lets a holding join late without that counting as growth", () => {
        const early: HoldingRecords = { id: "a", name: "A", startingBalance: 1_000_000, balance: 1_100_000, createdAt: at("2026-08-05T10:00:00+05:30"), flows: [], updates: [{ at: at("2026-09-10T10:00:00+05:30"), amount: 100_000 }] };
        const late: HoldingRecords = { id: "b", name: "B", startingBalance: 2_000_000, balance: 2_300_000, createdAt: at("2026-10-10T10:00:00+05:30"), flows: [], updates: [{ at: at("2026-11-05T10:00:00+05:30"), amount: 300_000 }] };
        const t = portfolioTrend([early, late], IST, NOW);
        assert.deepEqual(t.points.map((p) => p.month), ["2026-08", "2026-09", "2026-10", "2026-11"]);
        assert.deepEqual(t.points.map((p) => p.existing), [1, 1, 2, 2]);
        assert.equal(t.points[1].value, 1_100_000);
        assert.equal(t.points[2].value, 1_100_000 + 2_000_000);       // B arrives at its cost (no opening gain)
        // October: only A was there last month; B's arrival is not growth.
        assert.deepEqual(t.growth[2].parts.map((p) => p.id), ["a"]);
        assert.equal(t.growth[2].growth, 0);
        // November: both were there, B's update is the growth.
        assert.equal(t.growth[3].growth, 300_000);
        assert.deepEqual(t.growth[3].parts.map((p) => p.id), ["a", "b"]);
    });

    it("sums growth across holdings and keeps each one's part", () => {
        const t = portfolioTrend(ALL, IST, NOW);
        const oct = t.growth[1];
        const parts = Object.fromEntries(oct.parts.map((p) => [p.id, p.growth]));
        assert.equal(parts.icici, -268_381);
        assert.equal(parts.ppf, 0);
        assert.equal(parts.franklin, -998_928);
        assert.equal(oct.growth, -268_381 - 998_928);
        assert.equal(oct.upd, true);
        assert.equal(t.growth[2].upd, false);
    });

    it("reports the same figures per holding as on its own", () => {
        const t = portfolioTrend(ALL, IST, NOW);
        assert.deepEqual(t.holdings.map((h) => h.id), ["icici", "ppf", "franklin"]);
        assert.deepEqual(t.holdings[0], holdingTrend(ICICI, IST, NOW));
    });
});
