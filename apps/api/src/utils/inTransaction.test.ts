import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { inTransaction } from "./inTransaction";

// No database here: this pins that the helper goes through connection.transaction() (the one
// that resets document state on a retry), passes the session on, and returns fn's result. The
// retry behaviour itself is proven by the replay guard (scripts/guards/replay.ts).
test("delegates to connection.transaction with the session, and returns fn's result", async () => {
    const session = { id: "fake-session" } as unknown as mongoose.ClientSession;
    const original = mongoose.connection.transaction;
    let calls = 0;
    (mongoose.connection as unknown as { transaction: unknown }).transaction = async (fn: (s: mongoose.ClientSession) => Promise<unknown>) => { calls += 1; return fn(session); };
    try {
        const seen: unknown[] = [];
        const result = await inTransaction(async (s) => { seen.push(s); return 42; });
        assert.equal(result, 42);
        assert.deepEqual(seen, [session]);
        assert.equal(calls, 1);
        await assert.rejects(inTransaction(async () => { throw new Error("boom"); }), /boom/);
    }
    finally {
        (mongoose.connection as unknown as { transaction: unknown }).transaction = original;
    }
});
