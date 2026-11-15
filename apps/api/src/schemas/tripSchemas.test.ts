import test from "node:test";
import assert from "node:assert/strict";
import {
    addExpenseSchemas, closeTripSchemas, createTripSchemas, editExpenseSchemas, importCommitSchemas, importPreviewSchemas,
    planSchemas, reopenTripSchemas, settleSchemas, updateTripSchemas,
} from "./tripSchema";
import { validate } from "../middleware/validate";
import { styleProblems } from "../utils/messages";

type Parser = { safeParse: (v: unknown) => { success: boolean; data?: any; error?: { issues: { message: string; path: PropertyKey[]; params?: any }[] } } };

const ID = "65a1b2c3d4e5f60718293a4b";
const ID2 = "65a1b2c3d4e5f60718293a4c";
const AT = "2026-11-14T18:30:00.000Z";

const ok = (schema: Parser, input: unknown) => {
    const r = schema.safeParse(input);
    assert.ok(r.success, `refused ${JSON.stringify(input)}: ${JSON.stringify(r.error?.issues)}`);
    return r.data;
};
const fails = (schema: Parser, input: unknown) => {
    const r = schema.safeParse(input);
    assert.ok(!r.success, `accepted ${JSON.stringify(input)}`);
    for (const i of r.error!.issues) assert.deepEqual(styleProblems(i.message), [], i.message);
    return r.error!.issues;
};

// Bodies read from the 2.6.0 app (01efb7c): lib/trips.ts, TripSheet, TripExpenseSheet,
// SettleSheet, MatchSplitwiseSheet, trip-wrapup, trip-detail, trip-import.
test("every trip body the 2.6.0 app sends is accepted", () => {
    const tripDraft = { name: "Goa", emoji: "🏖", color: "teal", startDate: AT, endDate: AT, members: [ID, ID2], budget: null };
    ok(createTripSchemas.body, tripDraft);
    ok(createTripSchemas.body, { ...tripDraft, name: "G", members: [], budget: 2_000_000 });
    ok(updateTripSchemas.body, tripDraft);
    const youPaid = { title: "Dinner", occurredAt: AT, category: null, cost: 90_000, paidBy: null, paidFrom: ID, shares: [{ account: null, amount: 45_000 }, { account: ID2, amount: 45_000 }] };
    ok(addExpenseSchemas.body, youPaid);
    ok(addExpenseSchemas.body, { ...youPaid, category: ID, paidBy: ID2, paidFrom: null });
    ok(editExpenseSchemas.body, youPaid);
    ok(settleSchemas.body, { person: ID, account: ID2, amount: 10_000, direction: "received" });
    ok(settleSchemas.body, { person: ID, account: ID2, amount: 10_000, direction: "paid" });
    ok(planSchemas.body, { entries: [{ account: ID, amount: -5_000 }, { account: ID2, amount: 5_000 }] });
    ok(planSchemas.body, { entries: [] });
    assert.deepEqual(ok(closeTripSchemas.body, { letGo: [ID] }), { letGo: [ID] });
    assert.deepEqual(ok(closeTripSchemas.body, {}), { letGo: [] });
    ok(reopenTripSchemas.body, {});
    ok(importPreviewSchemas.body, { csv: "Date,Description" });
    ok(importPreviewSchemas.body, { csv: "Date,Description", mapping: { "Asha K": ID, Me: "me", "New Friend": "new" } });
    ok(importCommitSchemas.body, {
        csv: "Date,Description",
        mapping: { Me: "me", Asha: ID },
        decisions: [
            { key: "2026-11-01|dinner|900|general", action: "skip" },
            { key: "k2", action: "apply" },
            { key: "k3", action: "import", category: ID, account: ID2 },
            { key: "k4", action: "import", category: null, account: null, parts: [{ title: "Room", category: ID, cost: 100 }, { title: "Food", category: null, cost: 200 }] },
        ],
    });
});

test("settle-up takes a clientId, but never one shaped like the server's own keys", () => {
    ok(settleSchemas.body, { person: ID, account: ID2, amount: 10_000, direction: "received", clientId: "w3-abcdefgh" });
    fails(settleSchemas.body, { person: ID, account: ID2, amount: 10_000, direction: "received", clientId: `plan:${ID}:${ID2}` });
    fails(settleSchemas.body, { person: ID, account: ID2, amount: 10_000, direction: "received", clientId: "sw:abcdefgh" });
    fails(settleSchemas.body, { person: ID, account: ID2, amount: 10_000, direction: "received", clientId: "short" });
});

test("bad input gets a labelled sentence; a malformed body id is invalid_reference", () => {
    const [member] = fails(createTripSchemas.body, { name: "Goa", startDate: AT, endDate: AT, members: ["nope"] });
    assert.equal(member.params?.code, "invalid_reference");
    assert.equal(member.message, "A person on the trip isn't one of your people any more. Pick another");
    assert.equal(fails(createTripSchemas.body, { name: " ", startDate: AT, endDate: AT, members: [] })[0].message, "Give the trip a name");
    assert.equal(fails(createTripSchemas.body, { name: "Goa", startDate: null, endDate: AT, members: [] })[0].path[0], "startDate");
    assert.equal(fails(createTripSchemas.body, { name: "Goa", startDate: "soon", endDate: AT, members: [] })[0].path[0], "startDate");
    const youPaid = { title: "Dinner", occurredAt: AT, category: null, cost: 90_000, paidBy: null, paidFrom: ID, shares: [{ account: null, amount: 90_000 }] };
    fails(addExpenseSchemas.body, { ...youPaid, cost: 0 });
    fails(addExpenseSchemas.body, { ...youPaid, cost: 1.5 });
    assert.equal(fails(addExpenseSchemas.body, { ...youPaid, shares: [] })[0].message, "Pick who it's split between");
    assert.equal(fails(addExpenseSchemas.body, { ...youPaid, shares: [{ account: "x", amount: 1 }] })[0].params?.code, "invalid_reference");
    fails(planSchemas.body, { entries: [{ account: ID, amount: 1.5 }] });
    const [mapped] = fails(importCommitSchemas.body, { csv: "x", mapping: { Asha: "notanid" }, decisions: [] });
    assert.equal(mapped.params?.code, "invalid_reference");
});

test("validate() makes the bodies strict, so unknown fields are refused", async () => {
    const run = (schemas: Parameters<typeof validate>[0], body: unknown) => new Promise<unknown>((resolve) => {
        validate(schemas)({ params: { id: ID }, query: {}, body, originalUrl: `/api/v1/trips/${ID}` } as never, {} as never, resolve);
    });
    const err = await run(settleSchemas, { person: ID, account: ID2, amount: 100, direction: "paid", note: "x" }) as { issues: { code: string }[] };
    assert.equal(err.issues[0].code, "unrecognized_keys");
    assert.equal(await run(reopenTripSchemas, undefined), undefined);
    const notFound = await run({ params: closeTripSchemas.params }, {}) as undefined;
    assert.equal(notFound, undefined);
});
