import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { daysLate } from "./billService";

const ZONE = "Asia/Kolkata";

describe("daysLate", () => {
    it("is 0 for a bill paid exactly on its due date", () => {
        assert.equal(daysLate(new Date("2026-08-15T00:00:00Z"), new Date("2026-08-15T12:00:00Z"), ZONE), 0);
    });

    it("is positive for a bill paid after its due date", () => {
        assert.equal(daysLate(new Date("2026-08-15T00:00:00Z"), new Date("2026-08-18T00:00:00Z"), ZONE), 3);
    });

    it("is negative (or zero) for a bill paid before its due date", () => {
        assert.ok(daysLate(new Date("2026-08-15T00:00:00Z"), new Date("2026-08-10T00:00:00Z"), ZONE) < 0);
    });
});
