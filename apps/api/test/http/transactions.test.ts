import { before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import { useTestApi, type TestUser } from "../harness";
import { MALFORMED, MISSING, balanceOf, daysAgo, failed, keyed, par, replayed, retriedAfterFailure, rowsOn, signedOut, statuses, type Row } from "./moneyChecks";

// /transactions over HTTP, except the list and /summary (their own suite): create, edit and
// delete for every type, one transaction, title suggestions, splits and convert-to-investment.

const api = useTestApi();
let me: TestUser;
let other: TestUser;
let cat: string;
let cat2: string;
let incomeCat: string;
let otherBank: string;
let otherCat: string;

const TRIP_ROW = "This is part of a trip expense. Change it from the trip";
const NOT_FOUND = "That transaction doesn't exist any more";

before(async () => {
    await api.ready();
    me = await api.user("t3-txn");
    other = await api.user("t3-txn-other");
    const cats = (await me.send("GET", "/categories")).json.data as { _id: string; kind: string; parent?: string | null }[];
    [cat, cat2] = cats.filter((c) => c.kind === "expense" && !c.parent).map((c) => c._id);
    incomeCat = await me.category("income");
    otherBank = await other.account("Their bank");
    otherCat = await other.category("expense");
});

const now = () => new Date().toISOString();
const post = async (u: TestUser, body: Record<string, unknown>) => {
    const r = await u.send("POST", "/transactions", body);
    assert.equal(r.status, 201, r.text);
    return r.json.data as { _id: string; splitGroupId?: string | null; [k: string]: unknown };
};
const spend = (account: string, amount: number, extra: Record<string, unknown> = {}) =>
    post(me, { type: "expense", amount, account, category: cat, title: "Lunch", occurredAt: now(), ...extra });
const row = async (id: string) => (await api.ro.col("transactions").find<Row>({ _id: new ObjectId(id) }))[0];
const balances = (...ids: string[]) => Promise.all(ids.map((id) => balanceOf(api, id)));

/** A trip with Asha on it and one ₹200 expense split half-half, paid from `bank`. */
const tripRows = async (bank: string) => {
    const asha = await me.account(`Trip Asha ${randomUUID().slice(0, 4)}`, { type: "person", startingBalance: 0 });
    const trip = await me.send("POST", "/trips", { name: "Goa", startDate: daysAgo(2), endDate: daysAgo(-2), members: [asha], budget: null });
    assert.equal(trip.status, 201, trip.text);
    const e = await me.send("POST", `/trips/${trip.json.data._id}/expenses`, { title: "Villa", occurredAt: now(), category: null, cost: 20_000, paidBy: null, paidFrom: bank, shares: [{ account: null, amount: 10_000 }, { account: asha, amount: 10_000 }] });
    assert.equal(e.status, 201, e.text);
    const rows = await api.ro.col("transactions").find<Row>({ tripExpenseId: new ObjectId(e.json.data._id) });
    return { asha, share: String(rows.find((t) => t.type === "expense")!._id), owed: String(rows.find((t) => t.type === "transfer")!._id) };
};

test("create: each type moves exactly its balances", async () => {
    const bank = await me.account("C bank", { startingBalance: 1_00_000 });
    const wallet = await me.account("C wallet", { type: "wallet", startingBalance: 0 });
    const e = await me.send("POST", "/transactions", { type: "expense", amount: 12_345, account: bank, category: cat, title: "Groceries", note: "weekly", location: "Market", paymentMode: "upi", occurredAt: "2026-11-10T08:30:00.000Z" });
    assert.deepEqual([e.status, e.json.message], [201, "Transaction created"]);
    assert.deepEqual([e.json.data.type, e.json.data.amount, e.json.data.paymentMode, e.json.data.occurredAt, e.json.data.splitGroupId, e.json.data.userId], ["expense", 12_345, "upi", "2026-11-10T08:30:00.000Z", null, undefined]);
    await post(me, { type: "income", amount: 50_000, account: bank, category: incomeCat, title: "Salary" });
    await post(me, { type: "transfer", amount: 20_000, account: bank, toAccount: wallet });
    await post(me, { type: "positiveAdjustment", amount: 1_001, account: wallet });
    const neg = await post(me, { type: "negativeAdjustment", amount: 500, account: wallet, title: "Fees" });
    assert.deepEqual(await balances(bank, wallet), [1_00_000 - 12_345 + 50_000 - 20_000, 20_000 + 1_001 - 500]);
    assert.equal(neg.title, "Fees");
    // No moment sent: now.
    const at = Date.parse((await post(me, { type: "income", amount: 1, account: wallet, category: incomeCat, title: "Now" })).occurredAt as string);
    assert.ok(Math.abs(at - Date.now()) < 10_000);
    // The same account on both ends, in any case, is refused before anything is read.
    failed(await me.send("POST", "/transactions", { type: "transfer", amount: 1, account: bank, toAccount: bank.toUpperCase() }), 400, "invalid_input", { path: "toAccount", message: "Pick two different accounts" });
});

test("create: refused bodies, references and users, with nothing written", async () => {
    const bank = await me.account("R bank", { startingBalance: 10_000 });
    const asha = await me.account("R Asha", { type: "person", startingBalance: 0 });
    const wallet = await me.account("R wallet", { type: "wallet", startingBalance: 0 });
    const ok = { type: "expense", amount: 100, account: bank, category: cat, title: "x" };
    for (const [body, path] of [
        [{ ...ok, amount: 0 }, "amount"], [{ ...ok, amount: -5 }, "amount"], [{ ...ok, amount: 1.5 }, "amount"], [{ ...ok, amount: "100" }, "amount"],
        [{ ...ok, title: "" }, "title"], [{ ...ok, category: undefined }, "category"], [{ ...ok, occurredAt: "yesterday-ish" }, "occurredAt"],
        [{ ...ok, clientId: "short" }, "clientId"], [{ ...ok, paymentMode: "cheque" }, "paymentMode"], [{ ...ok, type: "refund" }, "type"],
        [{ ...ok, toAccount: asha }, ""], [{ ...ok, tripId: MISSING }, ""], [{ ...ok, splitGroupId: MISSING }, ""], [{ ...ok, userId: other.id }, ""],
        [{ type: "transfer", amount: 100, account: bank, toAccount: asha, category: cat }, ""],
        [{ type: "income", amount: 100, account: bank, category: incomeCat, title: "x", owedBy: [{ account: asha, amount: 1 }] }, ""],
        [{ type: "positiveAdjustment", amount: 100, account: bank, category: cat }, ""],
        [{ ...ok, owedBy: [] }, "owedBy"], [{ ...ok, owedBy: Array.from({ length: 11 }, () => ({ account: asha, amount: 1 })) }, "owedBy"],
        [{ ...ok, owedBy: [{ account: asha, amount: 0 }] }, "owedBy.0.amount"], [{ ...ok, owedBy: [{ account: asha, amount: 1, note: "x" }] }, "owedBy.0"],
    ] as const) {
        failed(await me.send("POST", "/transactions", body), 400, "invalid_input", { path });
    }
    for (const [body, path] of [
        [{ ...ok, account: MALFORMED }, "account"], [{ ...ok, account: otherBank }, "account"], [{ ...ok, account: MISSING }, "account"],
        [{ ...ok, category: otherCat }, "category"], [{ ...ok, category: incomeCat }, "category"], [{ ...ok, category: MALFORMED }, "category"],
        [{ type: "income", amount: 1, account: bank, category: cat, title: "x" }, "category"],
        [{ type: "transfer", amount: 1, account: bank, toAccount: otherBank }, "toAccount"],
        [{ ...ok, owedBy: [{ account: wallet, amount: 1 }] }, "owedBy.0.account"],
        [{ ...ok, owedBy: [{ account: asha, amount: 1 }, { account: otherBank, amount: 1 }] }, "owedBy.1.account"],
    ] as const) {
        failed(await me.send("POST", "/transactions", body), 400, "invalid_reference", { path });
    }
    for (const owedBy of [[{ account: asha, amount: 1 }, { account: asha.toUpperCase(), amount: 2 }], [{ account: bank, amount: 1 }]]) {
        failed(await me.send("POST", "/transactions", { ...ok, owedBy }), 400, "invalid_input", { message: "Each person can be in the split only once" });
    }
    assert.deepEqual([(await rowsOn(api, bank)).length, ...(await balances(bank, asha, otherBank))], [0, 10_000, 0, 1_000_000]);
    await signedOut(api, "POST", "/transactions", ok);
});

test("get one: own rows of any type; another user's, missing or malformed is 404", async () => {
    const bank = await me.account("G bank");
    const t = await spend(bank, 700);
    const sync = await me.send("PATCH", `/accounts/${bank}/balance`, { balance: 0 });
    assert.equal(sync.status, 200);
    const adj = (await rowsOn(api, bank)).find((x) => x.type === "negativeAdjustment")!;
    const r = await me.send("GET", `/transactions/${t._id}`);
    assert.deepEqual([r.status, r.json.message, r.json.data._id, r.json.data.amount, r.json.data.userId], [200, "Transaction fetched", t._id, 700, undefined]);
    assert.equal((await me.send("GET", `/transactions/${adj._id}`)).json.data.type, "negativeAdjustment");
    failed(await other.send("GET", `/transactions/${t._id}`), 404, "not_found", { message: NOT_FOUND });
    failed(await me.send("GET", `/transactions/${MISSING}`), 404, "not_found", { message: NOT_FOUND });
    failed(await me.send("GET", `/transactions/${MALFORMED}`), 404, "not_found", { message: NOT_FOUND });
    await signedOut(api, "GET", `/transactions/${t._id}`);
});

test("edit: amount, account, category, date and a transfer's ends move exactly the balances", async () => {
    const a = await me.account("E a", { startingBalance: 1_00_000 });
    const b = await me.account("E b", { startingBalance: 1_00_000 });
    const t = await spend(a, 10_000);
    const r = await me.send("PATCH", `/transactions/${t._id}`, { amount: 15_000, title: "Dinner", category: cat2, note: "n", paymentMode: "card" });
    assert.deepEqual([r.status, r.json.message, r.json.data.amount, r.json.data.title, r.json.data.category], [200, "Transaction updated", 15_000, "Dinner", cat2]);
    assert.deepEqual(await balances(a, b), [85_000, 1_00_000]);
    assert.equal((await me.send("PATCH", `/transactions/${t._id}`, { account: b, occurredAt: "2026-10-01T10:00:00.000Z" })).status, 200);
    assert.deepEqual(await balances(a, b), [1_00_000, 85_000]);
    assert.equal((await row(t._id)).occurredAt.toISOString(), "2026-10-01T10:00:00.000Z");

    const inc = await post(me, { type: "income", amount: 5_000, account: a, category: incomeCat, title: "Gift" });
    assert.equal((await me.send("PATCH", `/transactions/${inc._id}`, { amount: 6_000 })).status, 200);
    const tr = await post(me, { type: "transfer", amount: 3_000, account: a, toAccount: b });
    const c = await me.account("E c", { type: "cash", startingBalance: 0 });
    assert.equal((await me.send("PATCH", `/transactions/${tr._id}`, { toAccount: c, amount: 4_000 })).status, 200);
    const adj = await post(me, { type: "positiveAdjustment", amount: 100, account: c });
    assert.equal((await me.send("PATCH", `/transactions/${adj._id}`, { amount: 250 })).status, 200);
    assert.deepEqual(await balances(a, b, c), [1_00_000 + 6_000 - 4_000, 85_000, 4_000 + 250]);
});

test("edit: refused patches change nothing", async () => {
    const a = await me.account("ER a", { startingBalance: 50_000 });
    const t = await spend(a, 1_000);
    const tr = await post(me, { type: "transfer", amount: 500, account: a, toAccount: await me.account("ER b", { startingBalance: 0 }) });
    const adj = await post(me, { type: "positiveAdjustment", amount: 100, account: a });
    for (const [id, body, path] of [
        [t._id, { amount: 0 }, "amount"], [t._id, { title: "" }, "title"], [t._id, { type: "income" }, ""], [t._id, { clientId: "abcdefgh1" }, ""],
        [t._id, { owedBy: [] }, ""], [t._id, { splitGroupId: MISSING }, ""], [t._id, { tripId: MISSING }, ""], [t._id, { occurredAt: "never" }, "occurredAt"],
        [t._id, { toAccount: a }, ""], [tr._id, { category: cat }, ""], [tr._id, { toAccount: a }, "toAccount"], [tr._id, { title: "x" }, ""],
        [adj._id, { category: cat }, ""],
    ] as const) {
        failed(await me.send("PATCH", `/transactions/${id}`, body), 400, "invalid_input", { path });
    }
    for (const [id, body, path] of [
        [t._id, { account: otherBank }, "account"], [t._id, { account: MALFORMED }, "account"], [t._id, { category: otherCat }, "category"],
        [t._id, { category: incomeCat }, "category"], [tr._id, { toAccount: MISSING }, "toAccount"],
    ] as const) {
        failed(await me.send("PATCH", `/transactions/${id}`, body), 400, "invalid_reference", { path });
    }
    failed(await other.send("PATCH", `/transactions/${t._id}`, { amount: 1 }), 404, "not_found");
    failed(await me.send("PATCH", `/transactions/${MALFORMED}`, { amount: 1 }), 404, "not_found");
    failed(await me.send("PATCH", `/transactions/${MISSING}`, { amount: 1 }), 404, "not_found");
    assert.deepEqual([(await row(t._id)).amount, (await row(tr._id)).amount, await balanceOf(api, a)], [1_000, 500, 50_000 - 1_000 - 500 + 100]);
    await signedOut(api, "PATCH", `/transactions/${t._id}`, { amount: 1 });
});

test("delete: each type puts its balances back; twice, another user's or malformed is 404", async () => {
    const a = await me.account("D a", { startingBalance: 10_000 });
    const b = await me.account("D b", { startingBalance: 0 });
    const ids = [
        (await spend(a, 1_000))._id,
        (await post(me, { type: "income", amount: 2_000, account: a, category: incomeCat, title: "In" }))._id,
        (await post(me, { type: "transfer", amount: 3_000, account: a, toAccount: b }))._id,
        (await post(me, { type: "negativeAdjustment", amount: 400, account: b }))._id,
    ];
    failed(await other.send("DELETE", `/transactions/${ids[0]}`), 404, "not_found");
    for (const id of ids) {
        const r = await me.send("DELETE", `/transactions/${id}`);
        assert.deepEqual([r.status, r.json.data, r.json.message], [200, null, "Transaction deleted"]);
    }
    assert.deepEqual(await balances(a, b), [10_000, 0]);
    failed(await me.send("DELETE", `/transactions/${ids[0]}`), 404, "not_found", { message: NOT_FOUND });
    failed(await me.send("DELETE", `/transactions/${MALFORMED}`), 404, "not_found");
    await signedOut(api, "DELETE", `/transactions/${ids[0]}`);
});

test("a trip's rows can't be edited, deleted or converted here", async () => {
    const bank = await me.account("Trip bank", { startingBalance: 1_00_000 });
    const fund = await me.account("Trip fund", { type: "investment", startingBalance: 0 });
    const { asha, share, owed } = await tripRows(bank);
    for (const id of [share, owed]) {
        failed(await me.send("PATCH", `/transactions/${id}`, { amount: 1 }), 409, "conflict", { message: TRIP_ROW });
        failed(await me.send("DELETE", `/transactions/${id}`), 409, "conflict", { message: TRIP_ROW });
    }
    failed(await me.send("POST", `/transactions/${share}/convert-to-investment`, { toAccount: fund }), 409, "conflict", { message: TRIP_ROW });
    const bulk = await me.send("POST", "/transactions/convert-to-investment", { transactionIds: [share], toAccount: fund });
    assert.deepEqual(bulk.json.data, { converted: 0 });
    assert.deepEqual(await balances(bank, asha, fund), [80_000, 10_000, 0]);
});

test("split: create writes the expense and one transfer per person, one group, one moment", async () => {
    const bank = await me.account("S bank", { startingBalance: 1_00_000 });
    const asha = await me.account("S Asha", { type: "person", startingBalance: 0 });
    const ravi = await me.account("S Ravi", { type: "person", startingBalance: 500 });
    const e = await spend(bank, 30_000, { title: "Dinner", owedBy: [{ account: asha, amount: 20_000 }, { account: ravi, amount: 10_000 }] });
    assert.equal(e.amount, 30_000, "the response is the expense: my share");
    assert.deepEqual(await balances(bank, asha, ravi), [40_000, 20_000, 10_500]);
    const group = await api.ro.col("transactions").find<Row>({ splitGroupId: new ObjectId(e.splitGroupId!) });
    assert.deepEqual(group.map((g) => [g.type, g.amount, g.note ?? null]).sort(), [["expense", 30_000, null], ["transfer", 10_000, "Dinner"], ["transfer", 20_000, "Dinner"]]);
    assert.equal(new Set(group.map((g) => `${g.account}|${g.occurredAt.toISOString()}`)).size, 1);
});

test("split: an edit re-splits amount, account, date and title; a transfer alone can't move", async () => {
    const one = await me.account("SE one", { startingBalance: 1_00_000 });
    const two = await me.account("SE two", { startingBalance: 1_00_000 });
    const asha = await me.account("SE Asha", { type: "person", startingBalance: 0 });
    const ravi = await me.account("SE Ravi", { type: "person", startingBalance: 0 });
    const e = await spend(one, 30_000, { title: "Cab", owedBy: [{ account: asha, amount: 10_000 }, { account: ravi, amount: 1 }] });
    const groupOf = async () => (await api.ro.col("transactions").find<Row>({ splitGroupId: new ObjectId(e.splitGroupId!) })).sort((x, y) => x.amount - y.amount);

    // A third of my share: 10,000 → 3,333 (rounded); 1 paisa can't fall to 0.
    assert.equal((await me.send("PATCH", `/transactions/${e._id}`, { amount: 10_000 })).status, 200);
    assert.deepEqual((await groupOf()).map((g) => [g.type, g.amount]), [["transfer", 1], ["transfer", 3_333], ["expense", 10_000]]);
    assert.deepEqual(await balances(one, asha, ravi), [1_00_000 - 13_334, 3_333, 1]);

    const when = "2026-11-01T12:00:00.000Z";
    assert.equal((await me.send("PATCH", `/transactions/${e._id}`, { account: two, occurredAt: when, title: "Cab home" })).status, 200);
    const g = await groupOf();
    assert.ok(g.every((x) => String(x.account) === two && x.occurredAt.toISOString() === when));
    assert.deepEqual(g.filter((x) => x.type === "transfer").map((x) => x.note), ["Cab home", "Cab home"]);
    assert.deepEqual(await balances(one, two), [1_00_000, 1_00_000 - 13_334]);

    const transfer = String(g.find((x) => x.amount === 3_333)!._id);
    for (const body of [{ account: one }, { occurredAt: now() }]) {
        failed(await me.send("PATCH", `/transactions/${transfer}`, body), 409, "conflict", { message: "This is part of a split. Change the date or account on the expense itself" });
    }
    // What a person owes can still be corrected on its own.
    assert.equal((await me.send("PATCH", `/transactions/${transfer}`, { amount: 4_000 })).status, 200);
    assert.deepEqual(await balances(two, asha), [1_00_000 - 14_001, 4_000]);
    failed(await me.send("POST", `/transactions/${e._id}/convert-to-investment`, { toAccount: await me.account("SE fund", { type: "investment", startingBalance: 0 }) }), 409, "conflict", { message: "This expense is part of a split. Remove it from the split first" });
});

test("split: deleting one transfer takes that person off; deleting the expense takes the group", async () => {
    const bank = await me.account("SD bank", { startingBalance: 1_00_000 });
    const asha = await me.account("SD Asha", { type: "person", startingBalance: 0 });
    const ravi = await me.account("SD Ravi", { type: "person", startingBalance: 0 });
    const e = await spend(bank, 6_000, { owedBy: [{ account: asha, amount: 3_000 }, { account: ravi, amount: 2_000 }] });
    const ashaRow = (await rowsOn(api, asha))[0];
    assert.equal((await me.send("DELETE", `/transactions/${ashaRow._id}`)).status, 200);
    assert.deepEqual(await balances(bank, asha, ravi), [1_00_000 - 8_000, 0, 2_000]);
    assert.equal((await me.send("DELETE", `/transactions/${e._id}`)).status, 200);
    assert.deepEqual(await balances(bank, asha, ravi), [1_00_000, 0, 0]);
    assert.equal(await api.ro.col("transactions").count({ splitGroupId: new ObjectId(e.splitGroupId!) }), 0);
});

test("split: all or nothing when a write fails half-way (create and re-split)", async () => {
    const bank = await me.account("SX bank", { startingBalance: 1_00_000 });
    const asha = await me.account("SX Asha", { type: "person", startingBalance: 0 });
    const ravi = await me.account("SX Ravi", { type: "person", startingBalance: 0 });
    const e = await spend(bank, 10_000, { owedBy: [{ account: asha, amount: 10_000 }, { account: ravi, amount: 5_000 }] });
    // A database rule no route can set: it refuses one particular row, so the request fails after
    // its first writes have already landed inside the transaction.
    const refuse = (q: Record<string, unknown>) => api.db().command({ collMod: "transactions", validator: { $nor: [q] }, validationLevel: "strict", validationAction: "error" });
    try {
        await refuse({ type: "transfer", note: "T3 boom" });
        failed(await me.send("POST", "/transactions", { type: "expense", amount: 1_000, account: bank, category: cat, title: "T3 boom", owedBy: [{ account: asha, amount: 500 }, { account: ravi, amount: 700 }] }), 500, "internal");
        assert.equal(await api.ro.col("transactions").count({ title: "T3 boom" }), 0, "the expense written before the failure is gone");

        // Re-splitting to 7,777 gives Asha's transfer 7,777, which the rule refuses after the
        // expense itself was already rewritten.
        await refuse({ type: "transfer", amount: 7_777 });
        failed(await me.send("PATCH", `/transactions/${e._id}`, { amount: 7_777 }), 500, "internal");
    }
    finally {
        await api.db().command({ collMod: "transactions", validator: {}, validationLevel: "off" });
    }
    assert.deepEqual((await api.ro.col("transactions").find<Row>({ splitGroupId: new ObjectId(e.splitGroupId!) })).map((g) => g.amount).sort((x, y) => x - y), [5_000, 10_000, 10_000]);
    assert.deepEqual(await balances(bank, asha, ravi), [1_00_000 - 25_000, 10_000, 5_000]);
});

test("convert one expense: becomes a transfer into the holding; refusals", async () => {
    const bank = await me.account("CV bank", { startingBalance: 1_00_000 });
    const fund = await me.account("CV fund", { type: "investment", startingBalance: 0 });
    const t = await spend(bank, 25_000, { title: "SIP" });
    const r = await me.send("POST", `/transactions/${t._id}/convert-to-investment`, { toAccount: fund });
    assert.deepEqual([r.status, r.json.message, r.json.data.type, r.json.data.toAccount, r.json.data.category], [200, "Transaction converted", "transfer", fund, null]);
    assert.deepEqual(await balances(bank, fund), [75_000, 25_000]);
    failed(await me.send("POST", `/transactions/${t._id}/convert-to-investment`, { toAccount: fund }), 409, "conflict", { message: "Only an expense can be converted to an investment" });

    const inc = await post(me, { type: "income", amount: 1_000, account: bank, category: incomeCat, title: "Refund" });
    failed(await me.send("POST", `/transactions/${inc._id}/convert-to-investment`, { toAccount: fund }), 409, "conflict");
    const e2 = await spend(bank, 1_000);
    const theirFund = await other.account("Their fund", { type: "investment", startingBalance: 0 });
    const archived = await me.account("CV archived", { type: "investment", startingBalance: 0 });
    await me.send("DELETE", `/accounts/${archived}`);
    for (const toAccount of [bank, theirFund, archived, MISSING, MALFORMED]) {
        failed(await me.send("POST", `/transactions/${e2._id}/convert-to-investment`, { toAccount }), 400, "invalid_reference", { path: "toAccount" });
    }
    failed(await me.send("POST", `/transactions/${e2._id}/convert-to-investment`, {}), 400, "invalid_input", { path: "toAccount" });
    failed(await me.send("POST", `/transactions/${e2._id}/convert-to-investment`, { toAccount: fund, amount: 5 }), 400, "invalid_input");
    // An expense paid out of the holding itself can't be moved into it.
    const fromFund = await spend(fund, 1_000);
    failed(await me.send("POST", `/transactions/${fromFund._id}/convert-to-investment`, { toAccount: fund }), 400, "invalid_input", { message: "Pick two different accounts" });
    failed(await other.send("POST", `/transactions/${e2._id}/convert-to-investment`, { toAccount: theirFund }), 404, "not_found");
    failed(await me.send("POST", `/transactions/${MALFORMED}/convert-to-investment`, { toAccount: fund }), 404, "not_found");
    assert.deepEqual(await balances(bank, fund), [75_000 + 1_000 - 1_000, 25_000 - 1_000]);
    await signedOut(api, "POST", `/transactions/${e2._id}/convert-to-investment`, { toAccount: fund });
});

test("bulk convert: only plain expenses of mine move; everything else is skipped", async () => {
    const bank = await me.account("BC bank", { startingBalance: 1_00_000 });
    const fund = await me.account("BC fund", { type: "investment", startingBalance: 0 });
    const asha = await me.account("BC Asha", { type: "person", startingBalance: 0 });
    const plain = [(await spend(bank, 2_000))._id, (await spend(bank, 3_000))._id];
    const income = (await post(me, { type: "income", amount: 9_000, account: bank, category: incomeCat, title: "In" }))._id;
    const split = (await spend(bank, 1_000, { owedBy: [{ account: asha, amount: 1_000 }] }))._id;
    const fromFund = (await spend(fund, 1, {}))._id;
    const theirs = (await post(other, { type: "expense", amount: 4_000, account: otherBank, category: otherCat, title: "Theirs" }))._id;
    const r = await me.send("POST", "/transactions/convert-to-investment", { transactionIds: [...plain, income, split, fromFund, theirs, MISSING], toAccount: fund });
    assert.deepEqual([r.status, r.json.data, r.json.message], [200, { converted: 2 }, "Transactions converted"]);
    assert.deepEqual(await balances(bank, fund, otherBank), [1_00_000 - 5_000 + 9_000 - 2_000, 5_000 - 1, 1_000_000 - 4_000]);
    assert.equal((await row(theirs)).type, "expense");
    assert.equal((await me.send("POST", "/transactions/convert-to-investment", { transactionIds: plain, toAccount: fund })).json.data.converted, 0, "already converted");

    for (const [body, path] of [
        [{ transactionIds: [], toAccount: fund }, "transactionIds"],
        [{ transactionIds: Array.from({ length: 61 }, () => MISSING), toAccount: fund }, "transactionIds"],
        [{ transactionIds: plain }, "toAccount"],
        [{ transactionIds: plain, toAccount: fund, dryRun: true }, ""],
    ] as const) {
        failed(await me.send("POST", "/transactions/convert-to-investment", body), 400, "invalid_input", { path });
    }
    failed(await me.send("POST", "/transactions/convert-to-investment", { transactionIds: [MISSING, MALFORMED], toAccount: fund }), 400, "invalid_reference", { path: "transactionIds.1" });
    failed(await me.send("POST", "/transactions/convert-to-investment", { transactionIds: plain, toAccount: bank }), 400, "invalid_reference", { path: "toAccount" });
    await signedOut(api, "POST", "/transactions/convert-to-investment", { transactionIds: plain, toAccount: fund });
});

test("title suggestions: my everyday titles, grouped, most used first, last 12 months only", async () => {
    const u = await api.user("t3-titles");
    const bank = await u.account("Bank", { startingBalance: 10_00_000 });
    const other2 = await u.account("Wallet", { type: "wallet", startingBalance: 0 });
    const [c1, c2] = ((await u.send("GET", "/categories")).json.data as { _id: string; kind: string; parent?: string | null }[]).filter((c) => c.kind === "expense" && !c.parent).map((c) => c._id);
    const inc = await u.category("income");
    assert.deepEqual((await u.send("GET", "/transactions/title-suggestions")).json.data, []);
    const add = (body: Record<string, unknown>) => post(u, { account: bank, occurredAt: daysAgo(5), ...body });
    await add({ type: "expense", amount: 100, category: c1, title: "coffee ", occurredAt: daysAgo(20) });
    await add({ type: "expense", amount: 120, category: c1, title: "COFFEE", occurredAt: daysAgo(10) });
    const newest = await add({ type: "expense", amount: 150, category: c1, title: "Coffee", occurredAt: daysAgo(1) });
    await add({ type: "expense", amount: 900, category: c2, title: "Coffee" });
    await add({ type: "income", amount: 50_000, category: inc, title: "Salary" });
    await add({ type: "income", amount: 50_000, category: inc, title: "Salary", occurredAt: daysAgo(40) });
    await add({ type: "expense", amount: 1, category: c1, title: "Old shop", occurredAt: daysAgo(400) });
    await add({ type: "positiveAdjustment", amount: 1, title: "Correction" });
    await add({ type: "transfer", amount: 1, toAccount: other2 });
    await post(other, { type: "expense", amount: 1, account: otherBank, category: otherCat, title: "Not mine" });
    // A trip share is a one-off, not a habit.
    const asha = await u.account("Asha", { type: "person", startingBalance: 0 });
    const trip = await u.send("POST", "/trips", { name: "Trip", startDate: daysAgo(2), endDate: daysAgo(-2), members: [asha], budget: null });
    const tripExpense = await u.send("POST", `/trips/${trip.json.data._id}/expenses`, { title: "Coffee", occurredAt: now(), category: c1, cost: 2_000, paidBy: null, paidFrom: bank, shares: [{ account: null, amount: 1_000 }, { account: asha, amount: 1_000 }] });
    assert.equal(tripExpense.status, 201, tripExpense.text);

    const r = await u.send("GET", "/transactions/title-suggestions?anything=ignored");
    assert.deepEqual([r.status, r.json.message], [200, "Title suggestions fetched"]);
    const rows = r.json.data as { title: string; type: string; category: string | null; count: number; lastAmount: number; lastTransactionId: string }[];
    assert.deepEqual(rows[0], { title: "Coffee", type: "expense", category: c1, count: 3, lastAmount: 150, lastTransactionId: newest._id });
    assert.deepEqual(rows.slice(1).map((x) => [x.title, x.type, x.category, x.count, x.lastAmount]).sort(), [["Coffee", "expense", c2, 1, 900], ["Salary", "income", inc, 2, 50_000]]);
    await signedOut(api, "GET", "/transactions/title-suggestions");
});

test("Idempotency-Key on every transaction write: replay, 422 on a different body, failures not stored", async () => {
    const u = await api.user("t3-txn-keys");
    const bank = await u.account("K bank", { startingBalance: 1_00_000 });
    const fund = await u.account("K fund", { type: "investment", startingBalance: 0 });
    const c = await u.category("expense");
    const body = { type: "expense", amount: 1_000, account: bank, category: c, title: "K", occurredAt: now() };
    const made = await replayed(api, u.send, "POST", "/transactions", body, { body: { ...body, amount: 1_001 } });
    const id = made.json.data._id as string;
    await replayed(api, u.send, "PATCH", `/transactions/${id}`, { amount: 2_000 }, { body: { amount: 2_001 } });
    const two = [(await post(u, { ...body, title: "K2" }))._id, (await post(u, { ...body, title: "K3" }))._id];
    await replayed(api, u.send, "POST", `/transactions/${two[0]}/convert-to-investment`, { toAccount: fund }, { path: `/transactions/${two[1]}/convert-to-investment` });
    const bulk = [(await post(u, { ...body, title: "K4" }))._id, (await post(u, { ...body, title: "K5" }))._id];
    await replayed(api, u.send, "POST", "/transactions/convert-to-investment", { transactionIds: bulk, toAccount: fund }, { body: { transactionIds: [bulk[0]], toAccount: fund } });
    await replayed(api, u.send, "DELETE", `/transactions/${id}`, undefined, { path: `/transactions/${two[1]}` });
    assert.deepEqual(await balances(bank, fund), [1_00_000 - 1_000 * 4, 3_000]);
    assert.equal(await api.ro.col("transactions").count({ _id: new ObjectId(id) }), 0);
    assert.equal(await api.ro.col("transactions").count({ _id: new ObjectId(two[1]) }), 1, "the mismatched delete ran nothing");

    // Refused inside the route (after the key was claimed): released, so a fix can use the same key.
    await retriedAfterFailure(api, u.send, "POST", "/transactions", { body: { ...body, account: otherBank }, status: 400, code: "invalid_reference" }, { body: { ...body, title: "K6" } });
    await retriedAfterFailure(api, u.send, "PATCH", `/transactions/${two[1]}`, { body: { account: otherBank }, status: 400, code: "invalid_reference" }, { body: { amount: 500 } });
    await retriedAfterFailure(api, u.send, "DELETE", `/transactions/${MISSING}`, { status: 404, code: "not_found" }, { path: `/transactions/${two[1]}` });
    const inc = await post(u, { type: "income", amount: 1, account: bank, category: await u.category("income"), title: "In" });
    await retriedAfterFailure(api, u.send, "POST", `/transactions/${inc._id}/convert-to-investment`, { body: { toAccount: fund }, status: 409, code: "conflict" }, { path: `/transactions/${(await post(u, { ...body, title: "K7" }))._id}/convert-to-investment` });
    await retriedAfterFailure(api, u.send, "POST", "/transactions/convert-to-investment", { body: { transactionIds: [inc._id], toAccount: bank }, status: 400, code: "invalid_reference" }, { body: { transactionIds: [inc._id], toAccount: fund } });
    assert.deepEqual(await balances(bank, fund), [1_00_000 - 5 * 1_000 + 1, 4_000]);
});

test("races: delete ×3 and edit-vs-delete at once land once; a split edited and deleted at once", async () => {
    const u = await api.user("t3-txn-race");
    const a = await u.account("Race a", { startingBalance: 1_00_000 });
    const b = await u.account("Race b", { startingBalance: 0 });
    const asha = await u.account("Race Asha", { type: "person", startingBalance: 0 });
    const c = await u.category("expense");
    const tr = await post(u, { type: "transfer", amount: 7_000, account: a, toAccount: b });
    assert.deepEqual(statuses(await par(3, () => u.send("DELETE", `/transactions/${tr._id}`))), [200, 404, 404]);
    assert.deepEqual(await balances(a, b), [1_00_000, 0]);

    const t = await post(u, { type: "expense", amount: 2_000, account: a, category: c, title: "Race" });
    const [edit, del] = await Promise.all([u.send("PATCH", `/transactions/${t._id}`, { amount: 9_000 }), u.send("DELETE", `/transactions/${t._id}`)]);
    assert.equal(del.status, 200, del.text);
    assert.ok([200, 404, 409].includes(edit.status), `${edit.status}`);
    assert.equal(await balanceOf(api, a), 1_00_000);

    const s = await post(u, { type: "expense", amount: 3_000, account: a, category: c, title: "Race split", owedBy: [{ account: asha, amount: 3_000 }] });
    const [se, sd] = await Promise.all([u.send("PATCH", `/transactions/${s._id}`, { amount: 6_000 }), u.send("DELETE", `/transactions/${s._id}`)]);
    assert.equal(sd.status, 200, sd.text);
    assert.ok([200, 404, 409].includes(se.status), `${se.status}`);
    assert.deepEqual(await balances(a, asha), [1_00_000, 0]);
    assert.equal(await api.ro.col("transactions").count({ splitGroupId: new ObjectId(s.splitGroupId!) }), 0);

    // Many expenses on one account at once: every paisa lands.
    await par(8, (i) => post(u, { type: "expense", amount: 100 + i, account: a, category: c, title: `Burst ${i}` }));
    assert.equal(await balanceOf(api, a), 1_00_000 - (8 * 100 + 28));
});

test("one category rule (gaps row 18): own, right kind and live for a new choice; an edit may keep an archived one", async () => {
    const bank = await me.account("Cat bank", { startingBalance: 1_00_000 });
    const made = await me.send("POST", "/categories", { name: "Old hobby", kind: "expense" });
    assert.equal(made.status, 201, made.text);
    const old = made.json.data._id as string;
    const kept = await spend(bank, 1_000, { category: old, title: "Paint" });
    const bill = await me.send("POST", "/bills", { name: "Club", amount: 500, dueDate: now(), recurring: false, category: old });
    assert.equal(bill.status, 201, bill.text);
    const asha = await me.account("Cat Asha", { type: "person", startingBalance: 0 });
    const trip = await me.send("POST", "/trips", { name: "Cat trip", startDate: daysAgo(2), endDate: daysAgo(-2), members: [asha], budget: null });
    const tripExpense = (category: string) => ({ title: "Kit", occurredAt: now(), category, cost: 2_000, paidBy: null, paidFrom: bank, shares: [{ account: null, amount: 1_000 }, { account: asha, amount: 1_000 }] });
    const te = await me.send("POST", `/trips/${trip.json.data._id}/expenses`, tripExpense(old));
    assert.equal(te.status, 201, te.text);
    assert.equal((await me.send("DELETE", `/categories/${old}`)).status, 200);

    // A new row, or an edit that picks it, is refused.
    failed(await me.send("POST", "/transactions", { type: "expense", amount: 100, account: bank, category: old, title: "x" }), 400, "invalid_reference", { path: "category" });
    const fresh = await spend(bank, 100);
    failed(await me.send("PATCH", `/transactions/${fresh._id}`, { category: old }), 400, "invalid_reference", { path: "category" });
    failed(await me.send("PATCH", `/transactions/${fresh._id}`, { category: incomeCat }), 400, "invalid_reference", { path: "category" });
    failed(await me.send("POST", "/bills", { name: "Club 2", amount: 500, dueDate: now(), recurring: false, category: old }), 400, "invalid_reference", { path: "category" });
    failed(await me.send("POST", "/bills", { name: "Club 3", amount: 500, dueDate: now(), recurring: false, category: incomeCat }), 400, "invalid_reference", { path: "category" });
    failed(await me.send("POST", "/budgets", { category: old, month: "2026-12", limit: 1_000 }), 400, "invalid_reference", { path: "category" });
    failed(await me.send("POST", "/budgets", { category: incomeCat, month: "2026-12", limit: 1_000 }), 400, "invalid_reference", { path: "category" });
    failed(await me.send("POST", "/budgets", { category: otherCat, month: "2026-12", limit: 1_000 }), 400, "invalid_reference", { path: "category" });
    failed(await me.send("POST", `/trips/${trip.json.data._id}/expenses`, tripExpense(old)), 400, "invalid_reference", { path: "category" });
    failed(await me.send("POST", `/trips/${trip.json.data._id}/expenses`, tripExpense(incomeCat)), 400, "invalid_reference", { path: "category" });

    // Rows already filed under it stay editable, the category sent back as it is.
    assert.equal((await me.send("PATCH", `/transactions/${kept._id}`, { category: old, amount: 1_200 })).status, 200);
    assert.equal((await me.send("PATCH", `/bills/${bill.json.data._id}`, { category: old, amount: 600 })).status, 200);
    // A bill on an archived category is an I6 problem of its own (archiving a category leaves
    // its bills); removed so this file's invariant check is about this test's rows.
    assert.equal((await me.send("DELETE", `/bills/${bill.json.data._id}`)).status, 200);
    assert.equal((await me.send("PATCH", `/trips/${trip.json.data._id}/expenses/${te.json.data._id}`, { ...tripExpense(old), title: "Kit bag" })).status, 200);
});
