import { mock } from "node:test";
import assert from "node:assert/strict";
import { styleProblems } from "../../src/utils/messages";
import type { Reply, TestUser } from "../harness";

// Shared by the read-route suites (dashboard, insights, highlights, reviews, notifications).

/**
 * Freezes `Date` (and only `Date`) at `iso` for the server and the test alike, since both run
 * in this process: "this month", "today" and "this week" are then the same on every run.
 * Timers stay real, so the database driver and Express are unaffected. `resetClock()` after.
 * A token signed under the clock expires 7 days after it: use that user under the same clock.
 */
export const setClock = (iso: string): void => {
    const now = new Date(iso).getTime();
    try { mock.timers.enable({ apis: ["Date"], now }); }
    catch { mock.timers.setTime(now); }
};
export const resetClock = (): void => mock.timers.reset();

/** An error in the agreed shape: status, code, a sentence that follows the message rules. */
export const failed = (r: Reply, status: number, code: string, message?: string): void => {
    assert.equal(r.status, status, r.text);
    assert.equal(r.json.code, code, r.text);
    assert.equal(r.json.success, false);
    assert.equal(typeof r.json.requestId, "string");
    assert.deepEqual(styleProblems(r.json.message), [], r.json.message);
    if (message) assert.equal(r.json.message, message);
};

export const MISSING = "65a1b2c3d4e5f60718293a4b";

type Kind = "income" | "expense" | "transfer" | "positiveAdjustment" | "negativeAdjustment";

/** Posts one transaction and returns its id. */
export const txn = async (u: TestUser, type: Kind, amount: number, account: string, occurredAt: string, extra: Record<string, unknown> = {}): Promise<string> => {
    const body: Record<string, unknown> = { type, amount, account, occurredAt, ...extra };
    if ((type === "income" || type === "expense") && !body.category) body.category = await u.category(type);
    if ((type === "income" || type === "expense") && !body.title) body.title = `${type} ${amount}`;
    const r = await u.send("POST", "/transactions", body);
    assert.equal(r.status, 201, r.text);
    return r.json.data._id as string;
};

/** A trip with `members`, and one expense you paid from `account`, split evenly with them. */
export const tripWithExpense = async (u: TestUser, members: string[], account: string, cost: number, occurredAt: string, title = "Trip dinner"): Promise<string> => {
    const day = occurredAt.slice(0, 10);
    const trip = await u.send("POST", "/trips", { name: "Goa", startDate: day, endDate: day, members, budget: null });
    assert.equal(trip.status, 201, trip.text);
    const each = cost / (members.length + 1);
    const shares = [{ account: null, amount: each }, ...members.map((m) => ({ account: m, amount: each }))];
    const e = await u.send("POST", `/trips/${trip.json.data._id}/expenses`, { title, occurredAt, category: null, cost, paidBy: null, paidFrom: account, shares });
    assert.equal(e.status, 201, e.text);
    return trip.json.data._id as string;
};
