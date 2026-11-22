import { before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import { useTestApi, type TestUser } from "../harness";
import { MALFORMED, MISSING, balanceOf, daysAgo, failed, keyed, par, replayed, retriedAfterFailure, rowsOn, signedOut, statuses } from "./moneyChecks";

// /accounts over HTTP: every type, list order, reorder, edit, balance sync and archive.

const api = useTestApi();
let me: TestUser;
let other: TestUser;
let otherBank: string;

before(async () => {
    await api.ready();
    me = await api.user("t3-acc");
    other = await api.user("t3-acc-other");
    otherBank = await other.account("Their bank");
});

const stored = async (id: string) => (await api.ro.col("accounts").find<Record<string, unknown>>({ _id: new ObjectId(id) }))[0];

test("create: every type, with its balance in paise and the defaults", async () => {
    const u = await api.user("t3-acc-types");
    const cases = [
        { name: "HDFC", type: "bank", startingBalance: 12_345_67 },
        { name: "Amex", type: "credit_card", startingBalance: -4_500_00 },
        { name: "Pocket", type: "cash", startingBalance: 0 },
        { name: "Paytm", type: "wallet", startingBalance: 99 },
        { name: "Asha", type: "person", startingBalance: -1_000 },
        { name: "  Nifty  ", type: "investment", startingBalance: 1_00_000_00, currentValue: 1_12_500_00, investmentKind: "Index fund", investedSince: daysAgo(400), investedHow: "sip", icon: "chart", color: "violet" },
    ];
    const ids: string[] = [];
    for (const [i, body] of cases.entries()) {
        const r = await u.send("POST", "/accounts", body);
        assert.equal(r.status, 201, r.text);
        assert.equal(r.json.message, "Account created");
        const a = r.json.data;
        assert.equal(a.userId, undefined, "internal fields stay out");
        assert.deepEqual([a.type, a.order, a.isArchived, a.startingBalance], [body.type, i + 1, false, body.startingBalance], "after sign-up's Cash");
        assert.equal(a.balance, body.type === "investment" ? 1_12_500_00 : body.startingBalance);
        ids.push(a._id);
    }
    const [bank, , , , , fund] = await Promise.all(ids.map(stored));
    assert.deepEqual([bank.icon, bank.color, bank.investedSince, bank.investedHow, bank.lastSyncedAt], ["wallet", "success", null, null, null]);
    assert.equal(fund.name, "Nifty");
    assert.deepEqual([fund.icon, fund.color, fund.investmentKind, fund.investedHow], ["chart", "violet", "Index fund", "sip"]);
    assert.equal((fund.investedSince as Date).toISOString(), cases[5].investedSince);
    // A holding with no currentValue is worth what went in; its dates default to null.
    const plain = await u.send("POST", "/accounts", { name: "FD", type: "investment", startingBalance: 50_000 });
    assert.deepEqual([plain.json.data.balance, plain.json.data.investedSince, plain.json.data.investedHow], [50_000, null, null]);
    // Creating writes no transaction: the opening balance is the account's own.
    assert.equal(await api.ro.col("transactions").count({ userId: new ObjectId(u.id) }), 0);
});

test("create: refused bodies are 400 with the field named", async () => {
    const ok = { name: "X", type: "bank", startingBalance: 0 };
    for (const [body, path] of [
        [{ ...ok, name: "   " }, "name"],
        [{ ...ok, type: "loan" }, "type"],
        [{ ...ok, startingBalance: 10.5 }, "startingBalance"],
        [{ ...ok, startingBalance: "100" }, "startingBalance"],
        [{ name: "X", type: "bank" }, "startingBalance"],
        [{ ...ok, currentValue: 10 }, "currentValue"],
        [{ ...ok, investmentKind: "SIP" }, "investmentKind"],
        [{ ...ok, investedSince: daysAgo(3) }, "investedSince"],
        [{ ...ok, investedHow: "sip" }, "investedHow"],
        [{ ...ok, type: "investment", currentValue: -1 }, "currentValue"],
        [{ ...ok, type: "investment", investedSince: daysAgo(-2) }, "investedSince"],
        [{ ...ok, type: "investment", investedSince: "someday" }, "investedSince"],
        [{ ...ok, type: "investment", investedHow: "weekly" }, "investedHow"],
        [{ ...ok, balance: 500 }, ""],
        [{ ...ok, userId: other.id }, ""],
    ] as const) {
        failed(await me.send("POST", "/accounts", body), 400, "invalid_input", { path });
    }
    const future = await me.send("POST", "/accounts", { ...ok, type: "investment", investedSince: daysAgo(-2) });
    assert.equal(future.json.message, "The start date can't be in the future");
    assert.equal((await me.send("POST", "/accounts", { ...ok, investmentKind: "SIP" })).json.message, "Investment type is only for investments");
    const notJson = await me.send("POST", "/accounts", undefined, { raw: "{name:", contentType: "application/json" });
    failed(notJson, 400, "invalid_json");
    assert.equal(await api.ro.col("accounts").count({ userId: new ObjectId(me.id), name: "X" }), 0);
});

test("list: live accounts only, in order then creation, never another user's; a plain array", async () => {
    const u = await api.user("t3-acc-list");
    const list = async () => ((await u.send("GET", "/accounts")).json.data as { _id: string }[]).map((x) => x._id);
    const [cash] = await list();
    const a = await u.account("A"); const b = await u.account("B"); const c = await u.account("C");
    assert.deepEqual(await list(), [cash, a, b, c]);
    // Everyone on order 0 (older data): the createdAt tiebreak keeps the build order.
    await api.db().collection("accounts").updateMany({ userId: new ObjectId(u.id) }, { $set: { order: 0 } });
    assert.deepEqual(await list(), [cash, a, b, c]);
    assert.equal((await u.send("DELETE", `/accounts/${b}`)).status, 200);
    const r = await u.send("GET", "/accounts");
    assert.equal(r.status, 200);
    assert.equal(r.json.message, "Accounts fetched");
    assert.ok(Array.isArray(r.json.data));
    assert.deepEqual(r.json.data.map((x: { _id: string }) => x._id), [cash, a, c]);
    assert.ok(!(await list()).includes(otherBank));
    // A new account after an archive lands last (order = live count).
    const d = await u.account("D");
    assert.equal((await stored(d)).order, 3);
    await signedOut(api, "GET", "/accounts");
});

test("get one: its own live account; archived, another user's, missing or malformed is 404", async () => {
    const bank = await me.account("Get bank", { startingBalance: 7_000 });
    const r = await me.send("GET", `/accounts/${bank}`);
    assert.equal(r.status, 200);
    assert.deepEqual([r.json.data._id, r.json.data.balance, r.json.message], [bank, 7_000, "Account fetched"]);
    failed(await me.send("GET", `/accounts/${otherBank}`), 404, "not_found", { message: "That account doesn't exist any more" });
    failed(await me.send("GET", `/accounts/${MISSING}`), 404, "not_found");
    failed(await me.send("GET", `/accounts/${MALFORMED}`), 404, "not_found", { message: "That account doesn't exist any more" });
    await me.send("DELETE", `/accounts/${bank}`);
    failed(await me.send("GET", `/accounts/${bank}`), 404, "not_found");
    await signedOut(api, "GET", `/accounts/${bank}`);
});

test("edit: name, icon, colour, type and a holding's kind; never the balance", async () => {
    const bank = await me.account("Edit bank", { startingBalance: 30_000 });
    const r = await me.send("PATCH", `/accounts/${bank}`, { name: "  Salary  ", icon: "bank", color: "blue", type: "wallet" });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.json.data.name, r.json.data.icon, r.json.data.color, r.json.data.type, r.json.data.balance, r.json.message], ["Salary", "bank", "blue", "wallet", 30_000, "Account updated"]);
    assert.equal((await me.send("PATCH", `/accounts/${bank}`, {})).status, 200, "an empty edit is a no-op");

    const fund = await me.account("Edit fund", { type: "investment", startingBalance: 10_000 });
    const k = await me.send("PATCH", `/accounts/${fund}`, { investmentKind: "Gold" });
    assert.equal(k.json.data.investmentKind, "Gold");
    failed(await me.send("PATCH", `/accounts/${bank}`, { investmentKind: "Gold" }), 400, "invalid_input", { path: "investmentKind", message: "Investment type is only for investments" });
    // What the app sends on every save: the holding's own type back, with its kind.
    const same = await me.send("PATCH", `/accounts/${fund}`, { name: "Edit fund", type: "investment", icon: "chart", investmentKind: "SIP" });
    assert.deepEqual([same.status, same.json.data.type, same.json.data.investmentKind], [200, "investment", "SIP"]);

    for (const body of [{ balance: 1 }, { startingBalance: 1 }, { currentValue: 1 }, { investedSince: daysAgo(1) }, { isArchived: true }, { order: 3 }, { name: "" }, { type: "loan" }, { investmentKind: "x".repeat(41) }]) {
        failed(await me.send("PATCH", `/accounts/${fund}`, body), 400, "invalid_input");
    }
    assert.deepEqual([(await stored(fund)).balance, (await stored(fund)).startingBalance], [10_000, 10_000]);
    failed(await me.send("PATCH", `/accounts/${otherBank}`, { name: "Mine now" }), 404, "not_found");
    assert.equal((await stored(otherBank)).name, "Their bank");
    failed(await me.send("PATCH", `/accounts/${MALFORMED}`, { name: "x" }), 404, "not_found");
    await me.send("DELETE", `/accounts/${fund}`);
    failed(await me.send("PATCH", `/accounts/${fund}`, { name: "x" }), 404, "not_found");
    await signedOut(api, "PATCH", `/accounts/${bank}`, { name: "x" });
});

test("edit: a type change into or out of investment is refused and writes nothing; others still work", async () => {
    const u = await api.user("t3-acc-type");
    const bank = await u.account("Bank", { startingBalance: 1_00_000 });
    // A holding with an opening gain (cost ₹1,000, worth ₹1,500) and money moved in since.
    const fund = (await u.send("POST", "/accounts", { name: "Fund", type: "investment", startingBalance: 1_00_000, currentValue: 1_50_000, investmentKind: "SIP" })).json.data._id as string;
    assert.equal((await u.send("POST", "/transactions", { type: "transfer", amount: 20_000, account: bank, toAccount: fund })).status, 201);
    // A bank below zero.
    const overdrawn = await u.account("Overdrawn", { startingBalance: -1_000 });
    assert.equal((await u.send("POST", "/transactions", { type: "expense", amount: 500, account: overdrawn, category: await u.category("expense"), title: "Fee" })).status, 201);

    const snapshot = async () => Promise.all([fund, overdrawn, bank].map(async (id) => {
        const a = await stored(id);
        return [a.type, a.balance, a.startingBalance, a.investmentKind ?? null, (await rowsOn(api, id)).length];
    }));
    const before = await snapshot();
    const MESSAGE = "An account can't be turned into an investment or back. Add a new one instead";
    for (const type of ["bank", "credit_card", "cash", "wallet", "person"]) {
        failed(await u.send("PATCH", `/accounts/${fund}`, { type }), 400, "invalid_input", { path: "type", message: MESSAGE });
        failed(await u.send("PATCH", `/accounts/${fund}`, { name: "Renamed", type, icon: "bank" }), 400, "invalid_input", { path: "type" });
    }
    failed(await u.send("PATCH", `/accounts/${overdrawn}`, { type: "investment" }), 400, "invalid_input", { path: "type", message: MESSAGE });
    failed(await u.send("PATCH", `/accounts/${overdrawn}`, { name: "Renamed", type: "investment", investmentKind: "FD" }), 400, "invalid_input", { path: "type" });
    failed(await u.send("PATCH", `/accounts/${bank}`, { type: "investment" }), 400, "invalid_input", { path: "type" });
    assert.deepEqual(await snapshot(), before, "type, balance, cost and rows unchanged");
    assert.deepEqual([(await stored(fund)).name, (await stored(overdrawn)).name], ["Fund", "Overdrawn"]);

    // The 2.8.0 app's save: the same type back. And a holding's own edits still land.
    const same = await u.send("PATCH", `/accounts/${fund}`, { name: "Fund", type: "investment", icon: "chart", color: "violet", investmentKind: "Index" });
    assert.deepEqual([same.status, same.json.data.investmentKind, same.json.data.balance], [200, "Index", 1_70_000]);
    assert.equal((await u.send("PATCH", `/accounts/${overdrawn}`, { name: "Overdrawn", type: "bank" })).status, 200);
    // Among bank, wallet, cash and credit card nothing changes for the balance rules, so those still go through.
    for (const type of ["wallet", "cash", "credit_card", "bank"]) {
        const r = await u.send("PATCH", `/accounts/${overdrawn}`, { type });
        assert.deepEqual([r.status, r.json.data.type, r.json.data.balance], [200, type, -1_500], type);
    }
    await api.assertInvariants();
});

test("edit: a type change into or out of person is refused and writes nothing; trips and splits stay as they were", async () => {
    const u = await api.user("t3-acc-person");
    const bank = await u.account("Bank", { startingBalance: 1_00_000 });
    const asha = await u.account("Asha", { type: "person", startingBalance: 0 });
    const ravi = await u.account("Ravi", { type: "person", startingBalance: 0 });
    const cat = await u.category("expense");
    // Asha owes on a split and on a trip; the bank paid the trip's expense.
    assert.equal((await u.send("POST", "/transactions", { type: "expense", amount: 1_000, account: bank, category: cat, title: "Lunch", owedBy: [{ account: asha, amount: 1_000 }] })).status, 201);
    const trip = await u.send("POST", "/trips", { name: "Goa", startDate: daysAgo(2), endDate: daysAgo(-2), members: [asha, ravi], budget: null });
    assert.equal(trip.status, 201, trip.text);
    const tripId = trip.json.data._id as string;
    const expense = { title: "Villa", occurredAt: new Date().toISOString(), category: null, cost: 30_000, paidBy: null, paidFrom: bank, shares: [{ account: null, amount: 10_000 }, { account: asha, amount: 10_000 }, { account: ravi, amount: 10_000 }] };
    const added = await u.send("POST", `/trips/${tripId}/expenses`, expense);
    assert.equal(added.status, 201, added.text);
    const wallet = await u.account("Wallet", { type: "wallet", startingBalance: 2_000 });

    const snapshot = async () => Promise.all([asha, ravi, bank, wallet].map(async (id) => {
        const a = await stored(id);
        return [a.type, a.balance, a.startingBalance, (await rowsOn(api, id)).length];
    }));
    const before = await snapshot();
    const MESSAGE = "An account can't be turned into a person or back. Add a new one instead";
    for (const type of ["bank", "credit_card", "cash", "wallet"]) {
        failed(await u.send("PATCH", `/accounts/${asha}`, { type }), 400, "invalid_input", { path: "type", message: MESSAGE });
        failed(await u.send("PATCH", `/accounts/${ravi}`, { name: "Ravi K", type, icon: "bank" }), 400, "invalid_input", { path: "type" });
    }
    for (const id of [bank, wallet]) {
        failed(await u.send("PATCH", `/accounts/${id}`, { type: "person" }), 400, "invalid_input", { path: "type", message: MESSAGE });
    }
    failed(await u.send("PATCH", `/accounts/${asha}`, { type: "investment" }), 400, "invalid_input", { path: "type", message: "An account can't be turned into an investment or back. Add a new one instead" });
    assert.deepEqual(await snapshot(), before, "type, balance and rows unchanged");
    assert.equal((await stored(ravi)).name, "Ravi");

    // The 2.8.0 app's save: the same type back.
    const same = await u.send("PATCH", `/accounts/${asha}`, { name: "Asha M", type: "person", icon: "person", color: "info" });
    assert.deepEqual([same.status, same.json.data.type, same.json.data.name, same.json.data.balance], [200, "person", "Asha M", 11_000]);
    // The trip still takes its members back, and the expense paid from the bank can still be edited.
    assert.equal((await u.send("PATCH", `/trips/${tripId}`, { members: [asha, ravi] })).status, 200);
    assert.equal((await u.send("PATCH", `/trips/${tripId}/expenses/${added.json.data._id}`, expense)).status, 200);
    await api.assertInvariants();
});

test("reorder: the whole list front to back; duplicates, foreign, archived and malformed ids refused", async () => {
    const u = await api.user("t3-acc-reorder");
    const cash = ((await u.send("GET", "/accounts")).json.data as { _id: string }[])[0]._id;
    const [a, b, c] = [await u.account("A"), await u.account("B"), await u.account("C")];
    const r = await u.send("PATCH", "/accounts/reorder", { ids: [c, a, cash, b] });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.json.data, r.json.message], [{ reordered: 4 }, "Accounts reordered"]);
    assert.deepEqual(((await u.send("GET", "/accounts")).json.data as { _id: string; order: number }[]).map((x) => [x._id, x.order]), [[c, 0], [a, 1], [cash, 2], [b, 3]]);

    failed(await u.send("PATCH", "/accounts/reorder", { ids: [a, a.toUpperCase(), b] }), 400, "invalid_input", { message: "An account is in the list twice" });
    failed(await u.send("PATCH", "/accounts/reorder", { ids: [a, b, otherBank] }), 400, "invalid_reference", { path: "ids" });
    failed(await u.send("PATCH", "/accounts/reorder", { ids: [a, b, MISSING] }), 400, "invalid_reference");
    failed(await u.send("PATCH", "/accounts/reorder", { ids: [a, MALFORMED] }), 400, "invalid_reference", { path: "ids.1" });
    failed(await u.send("PATCH", "/accounts/reorder", { ids: [] }), 400, "invalid_input", { path: "ids" });
    failed(await u.send("PATCH", "/accounts/reorder", {}), 400, "invalid_input", { path: "ids" });
    failed(await u.send("PATCH", "/accounts/reorder", { ids: [a, b, c], order: [0, 1, 2] }), 400, "invalid_input");
    await u.send("DELETE", `/accounts/${b}`);
    failed(await u.send("PATCH", "/accounts/reorder", { ids: [b, a, c] }), 400, "invalid_reference");
    // Nothing above moved anything.
    assert.deepEqual([(await stored(c)).order, (await stored(a)).order], [0, 1]);
    assert.equal((await stored(otherBank)).order, 1, "after their Cash");
    await signedOut(api, "PATCH", "/accounts/reorder", { ids: [a] });
});

test("balance sync: the difference becomes one adjustment, up or down; a match writes nothing", async () => {
    const bank = await me.account("Sync bank", { startingBalance: 1_00_000 });
    const up = await me.send("PATCH", `/accounts/${bank}/balance`, { balance: 1_25_050 });
    assert.deepEqual([up.status, up.json.message, up.json.data.balance], [200, "Balance updated", 1_25_050]);
    assert.ok(up.json.data.lastSyncedAt);
    const down = await me.send("PATCH", `/accounts/${bank}/balance`, { balance: 90_000, note: "  Bank app  " });
    assert.deepEqual([down.json.message, down.json.data.balance], ["Balance updated", 90_000]);
    const rows = (await rowsOn(api, bank)).sort((x, y) => String(x._id).localeCompare(String(y._id)));
    assert.deepEqual(rows.map((t) => [t.type, t.amount, t.title]), [["positiveAdjustment", 25_050, "Balance correction"], ["negativeAdjustment", 35_050, "Bank app"]]);

    const before = (await stored(bank)).lastSyncedAt as Date;
    const same = await me.send("PATCH", `/accounts/${bank}/balance`, { balance: 90_000 });
    assert.deepEqual([same.status, same.json.message, same.json.data.balance], [200, "Balance confirmed", 90_000]);
    assert.ok(new Date(same.json.data.lastSyncedAt).getTime() >= before.getTime());
    assert.equal((await rowsOn(api, bank)).length, 2, "no zero-amount row");

    // A credit card runs negative; a person can owe either way.
    const card = await me.account("Sync card", { type: "credit_card", startingBalance: -20_000 });
    assert.equal((await me.send("PATCH", `/accounts/${card}/balance`, { balance: -65_432 })).json.data.balance, -65_432);
    const asha = await me.account("Sync Asha", { type: "person", startingBalance: 0 });
    assert.equal((await me.send("PATCH", `/accounts/${asha}/balance`, { balance: -1 })).json.data.balance, -1);
    assert.equal(await balanceOf(api, card), -65_432);
});

test("balance sync: refused bodies, ids and users", async () => {
    const bank = await me.account("Sync refusals", { startingBalance: 5_000 });
    for (const [body, path] of [[{}, "balance"], [{ balance: 1.5 }, "balance"], [{ balance: "10" }, "balance"], [{ balance: 1, note: "" }, "note"], [{ balance: 1, note: "n".repeat(121) }, "note"], [{ balance: 1, delta: 5 }, ""]] as const) {
        failed(await me.send("PATCH", `/accounts/${bank}/balance`, body), 400, "invalid_input", { path });
    }
    failed(await me.send("PATCH", `/accounts/${otherBank}/balance`, { balance: 0 }), 404, "not_found");
    failed(await me.send("PATCH", `/accounts/${MALFORMED}/balance`, { balance: 0 }), 404, "not_found");
    failed(await me.send("PATCH", `/accounts/${MISSING}/balance`, { balance: 0 }), 404, "not_found");
    await me.send("DELETE", `/accounts/${bank}`);
    failed(await me.send("PATCH", `/accounts/${bank}/balance`, { balance: 0 }), 404, "not_found");
    assert.deepEqual([await balanceOf(api, bank), await balanceOf(api, otherBank)], [5_000, 1_000_000]);
    await signedOut(api, "PATCH", `/accounts/${bank}/balance`, { balance: 0 });
});

test("archive: hidden everywhere, rows kept and still editable, no new rows; twice is 404", async () => {
    const bank = await me.account("Archive bank", { startingBalance: 50_000 });
    const cat = await me.category("expense");
    const t = await me.send("POST", "/transactions", { type: "expense", amount: 2_000, account: bank, category: cat, title: "Before" });
    assert.equal(t.status, 201);
    const r = await me.send("DELETE", `/accounts/${bank}`);
    assert.deepEqual([r.status, r.json.data, r.json.message], [200, null, "Account archived"]);
    assert.equal((await stored(bank)).isArchived, true);
    failed(await me.send("DELETE", `/accounts/${bank}`), 404, "not_found");
    failed(await me.send("POST", "/transactions", { type: "expense", amount: 1, account: bank, category: cat, title: "After" }), 400, "invalid_reference", { path: "account" });
    const edited = await me.send("PATCH", `/transactions/${t.json.data._id}`, { amount: 3_000 });
    assert.equal(edited.status, 200, edited.text);
    assert.equal(await balanceOf(api, bank), 47_000);
    failed(await me.send("DELETE", `/accounts/${otherBank}`), 404, "not_found");
    failed(await me.send("DELETE", `/accounts/${MALFORMED}`), 404, "not_found");
    assert.equal((await stored(otherBank)).isArchived, false);
    await signedOut(api, "DELETE", `/accounts/${otherBank}`);
});

test("Idempotency-Key: create and balance sync replay, 422 on a different body, failures not stored", async () => {
    const u = await api.user("t3-acc-keys");
    const made = await replayed(api, u.send, "POST", "/accounts", { name: "Keyed", type: "bank", startingBalance: 10_000 }, { body: { name: "Keyed", type: "bank", startingBalance: 20_000 } });
    assert.equal(await api.ro.col("accounts").count({ userId: new ObjectId(u.id), name: "Keyed" }), 1);
    const bank = made.json.data._id as string;
    await replayed(api, u.send, "PATCH", `/accounts/${bank}/balance`, { balance: 15_000 }, { body: { balance: 16_000 } });
    assert.equal(await balanceOf(api, bank), 15_000);
    assert.equal((await rowsOn(api, bank)).length, 1);
    // The same key on another account's sync is another request.
    const second = await u.account("Keyed two");
    const key = randomUUID();
    assert.equal((await u.send("PATCH", `/accounts/${bank}/balance`, { balance: 1 }, keyed(key))).status, 200);
    failed(await u.send("PATCH", `/accounts/${second}/balance`, { balance: 1 }, keyed(key)), 422, "idempotency_mismatch");
    assert.equal(await balanceOf(api, second), 1_000_000);

    await retriedAfterFailure(api, u.send, "POST", "/accounts", { body: { name: "Later", type: "bank", startingBalance: 1.5 }, status: 400, code: "invalid_input" }, { body: { name: "Later", type: "bank", startingBalance: 150 } });
    await retriedAfterFailure(api, u.send, "PATCH", `/accounts/${MISSING}/balance`, { body: { balance: 9 }, status: 404, code: "not_found" }, { path: `/accounts/${second}/balance` });
    assert.equal(await balanceOf(api, second), 9);
    failed(await u.send("POST", "/accounts", { name: "Bad key", type: "bank", startingBalance: 0 }, keyed("has spaces")), 400, "invalid_input", { path: "Idempotency-Key" });
    // A key is the user's own: another user's identical key runs on its own.
    const shared = randomUUID();
    const mine = await u.send("POST", "/accounts", { name: "Shared key", type: "cash", startingBalance: 0 }, keyed(shared));
    const theirs = await other.send("POST", "/accounts", { name: "Shared key", type: "cash", startingBalance: 0 }, keyed(shared));
    assert.deepEqual([mine.status, theirs.status, theirs.headers.get("idempotent-replayed")], [201, 201, null]);
    assert.notEqual(mine.json.data._id, theirs.json.data._id);
});

test("races: one create key ×3 at once is one account; archive ×2 at once; a sync racing an expense", async () => {
    const u = await api.user("t3-acc-race");
    const key = randomUUID();
    const body = { name: "Race", type: "wallet", startingBalance: 5_000 };
    const r = await par(3, () => u.send("POST", "/accounts", body, keyed(key)));
    assert.ok(r.every((x) => x.status === 201 || (x.status === 409 && x.json.code === "idempotency_in_progress")), statuses(r).join());
    assert.equal(await api.ro.col("accounts").count({ userId: new ObjectId(u.id), name: "Race" }), 1);

    const bank = await u.account("Race bank", { startingBalance: 1_00_000 });
    assert.deepEqual(statuses(await par(2, () => u.send("DELETE", `/accounts/${bank}`))), [200, 404]);

    const live = await u.account("Race live", { startingBalance: 1_00_000 });
    const cat = await u.category("expense");
    const [sync, spend] = await Promise.all([
        u.send("PATCH", `/accounts/${live}/balance`, { balance: 2_00_000 }),
        u.send("POST", "/transactions", { type: "expense", amount: 5_000, account: live, category: cat, title: "Race spend" }),
    ]);
    assert.equal(spend.status, 201, spend.text);
    assert.ok(sync.status === 200 || sync.status === 409, `${sync.status}`);
    if (sync.status === 409) failed(sync, 409, "conflict");
    const end = await balanceOf(api, live);
    assert.ok(sync.status === 200 ? [2_00_000, 1_95_000].includes(end) : end === 95_000, `${sync.status} → ${end}`);

    // Archiving while an expense lands: either the expense made it before the archive, or it is refused.
    const doomed = await u.account("Race doomed", { startingBalance: 10_000 });
    const [arch, late] = await Promise.all([
        u.send("DELETE", `/accounts/${doomed}`),
        u.send("POST", "/transactions", { type: "expense", amount: 1_000, account: doomed, category: cat, title: "Race late" }),
    ]);
    assert.equal(arch.status, 200);
    if (late.status === 201) assert.equal(await balanceOf(api, doomed), 9_000);
    else { failed(late, 400, "invalid_reference"); assert.equal(await balanceOf(api, doomed), 10_000); }
});

test("archive detaches the account (gaps row 6): no longer the default, off its bills, its SIPs paused until pointed elsewhere", async () => {
    const u = await api.user("archive-detach");
    const bank = await u.account("Detach bank", { startingBalance: 50_000 });
    const spare = await u.account("Detach spare", { startingBalance: 50_000 });
    const fund = await u.account("Detach fund", { type: "investment", startingBalance: 10_000 });
    const fund2 = await u.account("Detach fund 2", { type: "investment", startingBalance: 0 });
    assert.equal((await u.send("PATCH", "/users/me", { prefs: { defaultAccount: bank } })).status, 200);
    const day = new Date(Date.now() - 86_400_000).toISOString();
    const rent = await u.send("POST", "/bills", { name: "Rent", amount: 1_000, dueDate: day, recurring: true, frequency: "monthly", account: bank });
    const sip = await u.send("POST", "/bills", { name: "Index SIP", amount: 1_000, dueDate: day, recurring: true, frequency: "monthly", toInvestment: fund, category: null });
    assert.deepEqual([rent.status, sip.status], [201, 201]);

    // Money left in it does not block (decision 3a).
    assert.equal((await u.send("DELETE", `/accounts/${bank}`)).status, 200);
    assert.equal((await u.send("DELETE", `/accounts/${fund}`)).status, 200);
    assert.equal((await u.send("GET", "/auth/me")).json.data.prefs.defaultAccount ?? null, null);
    const bills = await api.ro.col("bills").find<{ _id: ObjectId; account?: ObjectId; toInvestment?: ObjectId; pausedAt: Date | null }>({ userId: new ObjectId(u.id) });
    const byName = (id: string) => bills.find((b) => String(b._id) === id)!;
    assert.equal(byName(rent.json.data._id).account, undefined);
    assert.equal(String(byName(sip.json.data._id).toInvestment), fund);
    assert.ok(byName(sip.json.data._id).pausedAt instanceof Date);

    // Rent asks for an account now that it has none and there's no default; the SIP is paused.
    const pay = await u.send("POST", `/bills/${rent.json.data._id}/pay`, {});
    assert.deepEqual([pay.status, pay.json.message], [400, "Pick an account to pay this bill from"]);
    assert.equal((await u.send("POST", `/bills/${rent.json.data._id}/pay`, { account: spare })).status, 200);
    const sipPay = await u.send("POST", `/bills/${sip.json.data._id}/pay`, { account: spare });
    assert.deepEqual([sipPay.status, sipPay.json.message], [409, "This bill's holding isn't there any more. Edit the bill to pick another"]);
    assert.equal((await u.send("POST", `/bills/${sip.json.data._id}/skip`)).status, 409);
    const listed = ((await u.send("GET", "/bills")).json.data as { _id: string; status: string; pausedAt: string | null }[]).find((b) => b._id === sip.json.data._id)!;
    assert.equal(listed.status, "pending");
    assert.equal(typeof listed.pausedAt, "string");

    // Pointed at another holding, it is live again and pays into it.
    assert.equal((await u.send("PATCH", `/bills/${sip.json.data._id}`, { toInvestment: fund2 })).status, 200);
    assert.equal((await u.send("POST", `/bills/${sip.json.data._id}/pay`, { account: spare })).status, 200);
    assert.equal((await stored(fund2)).balance, 1_000);
    assert.deepEqual((await api.problems()).filter((p) => p.email === u.email), []);
});
