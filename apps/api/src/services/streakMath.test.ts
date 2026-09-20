import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { currentStreak } from "./streakMath";

// Every fixture states an absolute instant in UTC and a zone to read it in, so the suite
// gives the same answer wherever it runs — same convention as highlightSnapshotMath.test.ts.

const DELHI = "Asia/Kolkata";

describe("currentStreak", () => {
    it("counts backward from today when today is already logged", () => {
        const now = new Date("2026-09-19T10:00:00Z"); // 3:30pm in Delhi, the 19th
        const days = new Set(["2026-09-17", "2026-09-18", "2026-09-19"]);
        assert.equal(currentStreak(days, now, DELHI), 3);
    });

    it("counts backward from yesterday when today hasn't been logged yet — a day still in progress cannot have broken the streak", () => {
        const now = new Date("2026-09-19T05:00:00Z"); // 10:30am in Delhi, nothing logged yet today
        const days = new Set(["2026-09-17", "2026-09-18"]);
        assert.equal(currentStreak(days, now, DELHI), 2);
    });

    it("is zero once there's a gap, even one day back", () => {
        const now = new Date("2026-09-19T10:00:00Z");
        const days = new Set(["2026-09-15", "2026-09-16", "2026-09-19"]);
        // The 19th is logged, but the 18th isn't — the streak the 19th belongs to is 1.
        assert.equal(currentStreak(days, now, DELHI), 1);
    });

    it("is zero when neither today nor yesterday is logged", () => {
        const now = new Date("2026-09-19T10:00:00Z");
        const days = new Set(["2026-09-10"]);
        assert.equal(currentStreak(days, now, DELHI), 0);
    });

    it("reads the day boundary in the user's zone, not UTC", () => {
        // 00:30 on the 19th in Delhi is still the 18th in UTC — a streak check that read
        // the day in UTC would look for "the 18th" and miss today's own entry.
        const now = new Date("2026-09-18T19:00:00Z");
        const days = new Set(["2026-09-18", "2026-09-19"]);
        assert.equal(currentStreak(days, now, DELHI), 2);
    });
});
