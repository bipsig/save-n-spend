import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { billState, daysLate, type BillStateInput } from "./billService";

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

describe("billState", () => {
    const now = new Date("2026-11-22T06:00:00Z");
    const bill = (b: Partial<BillStateInput>): BillStateInput => ({ dueDate: now, lastPaidAt: null, status: "pending", recurring: false, ...b });

    it("a one-off paid last month is settled, not overdue (gaps row 9), and drops off the list", () => {
        const s = billState(bill({ dueDate: new Date("2026-10-10T00:00:00Z"), lastPaidAt: new Date("2026-10-09T00:00:00Z"), status: "paid" }), now, ZONE);
        assert.deepEqual(s, { settled: true, status: "paid", daysUntilDue: -43, listed: false, paused: false });
    });

    it("a SIP paused when its holding was archived is listed but never late (gaps row 6)", () => {
        const s = billState(bill({ recurring: true, frequency: "monthly", dueDate: new Date("2026-09-11T18:30:00Z"), pausedAt: new Date("2026-11-01T00:00:00Z") }), now, ZONE);
        assert.deepEqual([s.paused, s.settled, s.status, s.listed], [true, true, "pending", true]);
    });

    it("a one-off paid this month is listed as paid", () => {
        const s = billState(bill({ dueDate: new Date("2026-11-30T00:00:00Z"), lastPaidAt: new Date("2026-11-20T00:00:00Z"), status: "paid" }), now, ZONE);
        assert.equal(s.status, "paid");
        assert.equal(s.listed, true);
    });

    it("a recurring bill three months behind and paid once this month stays overdue (gaps row 10)", () => {
        // Due 12 Sept, paid once in November: the due date rolled to 12 Oct, still in the past.
        const s = billState(bill({ recurring: true, frequency: "monthly", dueDate: new Date("2026-10-11T18:30:00Z"), lastPaidAt: new Date("2026-11-21T00:00:00Z") }), now, ZONE);
        assert.equal(s.settled, false);
        assert.equal(s.status, "overdue");
        assert.equal(s.daysUntilDue, -41);
    });

    it("a recurring bill paid this month, due next month, is settled and paid", () => {
        const s = billState(bill({ recurring: true, frequency: "monthly", dueDate: new Date("2026-12-11T18:30:00Z"), lastPaidAt: new Date("2026-11-12T00:00:00Z") }), now, ZONE);
        assert.deepEqual([s.settled, s.status], [true, "paid"]);
    });

    it("a recurring bill skipped (or paid early) into a future month is settled but reads pending", () => {
        const s = billState(bill({ recurring: true, frequency: "monthly", dueDate: new Date("2026-12-11T18:30:00Z"), lastPaidAt: new Date("2026-10-12T00:00:00Z") }), now, ZONE);
        assert.deepEqual([s.settled, s.status], [true, "pending"]);
    });

    it("a recurring bill due later this month is pending, and due earlier this month overdue", () => {
        assert.deepEqual(billState(bill({ recurring: true, frequency: "monthly", dueDate: new Date("2026-11-27T18:30:00Z") }), now, ZONE).status, "pending");
        assert.deepEqual(billState(bill({ recurring: true, frequency: "monthly", dueDate: new Date("2026-11-04T18:30:00Z"), lastPaidAt: new Date("2026-11-03T00:00:00Z") }), now, ZONE).status, "overdue");
    });

    it("a yearly bill compares years", () => {
        assert.equal(billState(bill({ recurring: true, frequency: "yearly", dueDate: new Date("2027-01-04T18:30:00Z") }), now, ZONE).settled, true);
        assert.equal(billState(bill({ recurring: true, frequency: "yearly", dueDate: new Date("2026-03-04T18:30:00Z") }), now, ZONE).status, "overdue");
    });
});
