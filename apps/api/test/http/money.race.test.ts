/**
 * W1's race and replay tests for the money routes: each request sent twice, and in parallel,
 * as a fresh user on the in-memory database (test/harness.ts). Balances are read straight from
 * the database and must add up to their rows afterwards.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import { useTestApi, type Reply, type Send } from "../harness";
import { effectsOf } from "../../scripts/invariants/rules";

const api = useTestApi();
let send: Send;
let cat: string;

before(async () => {
    await api.ready();
    const u = await api.user("w1-race");
    send = u.send;
    cat = await u.category("expense");
});
const ro = { col: (name: Parameters<typeof api.ro.col>[0]) => api.ro.col(name) };

const par = <T>(n: number, fn: (i: number) => Promise<T>) => Promise.all(Array.from({ length: n }, (_, i) => fn(i)));
const codes = (rs: Reply[]) => rs.map((r) => r.status).sort();
const acc = async (name: string, startingBalance = 1_000_000, type = "bank") => {
    const r = await send("POST", "/accounts", { name, type, startingBalance });
    assert.equal(r.status, 201, r.json?.message);
    return r.json.data._id as string;
};
const create = async (body: Record<string, unknown>) => {
    const r = await send("POST", "/transactions", { occurredAt: new Date().toISOString(), ...body });
    assert.equal(r.status, 201, r.json?.message);
    return r.json.data as { _id: string; splitGroupId?: string };
};
const expense = (account: string, amount: number, extra: Record<string, unknown> = {}) =>
    create({ type: "expense", amount, account, category: cat, title: "race", ...extra });
const balance = async (id: string) => (await ro.col("accounts").find<{ balance: number }>({ _id: new ObjectId(id) }))[0].balance;
const rows = (q: Record<string, unknown>) => ro.col("transactions").find<{ _id: ObjectId; type: string; amount: number; account: ObjectId; toAccount?: ObjectId; occurredAt: Date }>(q);
/** Each account's balance minus (starting balance + its rows): all zero when nothing drifted. */
const drift = async (...ids: string[]) => {
    const oids = ids.map((i) => new ObjectId(i));
    const accounts = await ro.col("accounts").find<{ _id: ObjectId; balance: number; startingBalance?: number }>({ _id: { $in: oids } });
    const txns = await rows({ $or: [{ account: { $in: oids } }, { toAccount: { $in: oids } }] });
    const sums = new Map<string, number>();
    for (const t of txns) for (const [a, d] of effectsOf(t)) sums.set(a, (sums.get(a) ?? 0) + d);
    return ids.map((id) => { const a = accounts.find((x) => String(x._id) === id)!; return a.balance - ((a.startingBalance ?? 0) + (sums.get(id) ?? 0)); });
};
const noDrift = async (...ids: string[]) => assert.deepEqual(await drift(...ids), ids.map(() => 0));

test("create with one clientId: twice, then ×3 at once → one row, the replays 200 with it, never a 409", async () => {
    const bank = await acc("create bank");
    const body = { type: "expense", amount: 10_000, account: bank, category: cat, title: "once", occurredAt: new Date().toISOString(), clientId: `w1-${randomUUID()}` };
    const a = await send("POST", "/transactions", body);
    const b = await send("POST", "/transactions", body);
    assert.deepEqual([a.status, b.status], [201, 200]);
    assert.equal(b.json.data._id, a.json.data._id);
    const body2 = { ...body, clientId: `w1-${randomUUID()}` };
    const r = await par(3, () => send("POST", "/transactions", body2));
    assert.deepEqual(codes(r), [200, 200, 201]);
    assert.equal(new Set(r.map((x) => x.json.data._id)).size, 1);
    assert.equal((await rows({ account: new ObjectId(bank) })).length, 2);
    await noDrift(bank);
});

test("edit to two amounts at once, then twice in a row → the row and the bank agree", async () => {
    const bank = await acc("edit bank");
    const t = await expense(bank, 10_000);
    const r = await Promise.all([20_000, 30_000].map((amount) => send("PATCH", `/transactions/${t._id}`, { amount })));
    assert.ok(r.every((x) => x.status === 200 || x.status === 409), codes(r).join());
    await noDrift(bank);
    for (let i = 0; i < 2; i += 1) assert.equal((await send("PATCH", `/transactions/${t._id}`, { amount: 40_000 })).status, 200);
    assert.equal(await balance(bank), 1_000_000 - 40_000);
    await noDrift(bank);
});

test("gaps #30: editing a split's amount re-splits it, twice and at once, with balances right (I2)", async () => {
    const bank = await acc("split bank"); const asha = await acc("Asha", 0, "person"); const ravi = await acc("Ravi", 0, "person");
    // ₹300 mine, Asha ₹300, Ravi ₹150.
    const t = await expense(bank, 30_000, { owedBy: [{ account: asha, amount: 30_000 }, { account: ravi, amount: 15_000 }] });
    const r = await par(2, () => send("PATCH", `/transactions/${t._id}`, { amount: 60_000, title: "race", category: cat, occurredAt: new Date("2026-11-10T12:00:00Z").toISOString() }));
    assert.deepEqual(codes(r), [200, 200]);
    const again = await send("PATCH", `/transactions/${t._id}`, { amount: 60_000 });
    assert.equal(again.status, 200);
    assert.deepEqual([await balance(bank), await balance(asha), await balance(ravi)], [1_000_000 - 150_000, 60_000, 30_000]);
    const group = await rows({ splitGroupId: new ObjectId(t.splitGroupId!) });
    assert.equal(group.length, 3);
    assert.equal(new Set(group.map((g) => `${g.account}|${new Date(g.occurredAt).toISOString()}`)).size, 1, "every member on one account at one moment");
    await noDrift(bank, asha, ravi);
});

test("a split's account and date move with the expense; its transfer alone can't move them", async () => {
    const one = await acc("split one"); const two = await acc("split two"); const asha = await acc("Asha two", 0, "person");
    const t = await expense(one, 10_000, { owedBy: [{ account: asha, amount: 5_000 }] });
    const when = new Date("2026-11-09T09:00:00Z").toISOString();
    assert.equal((await send("PATCH", `/transactions/${t._id}`, { account: two, occurredAt: when })).status, 200);
    const group = await rows({ splitGroupId: new ObjectId(t.splitGroupId!) });
    assert.ok(group.every((g) => String(g.account) === two && new Date(g.occurredAt).toISOString() === when));
    const transfer = group.find((g) => g.type === "transfer")!;
    const r = await send("PATCH", `/transactions/${transfer._id}`, { occurredAt: new Date().toISOString() });
    assert.deepEqual([r.status, r.json.code], [409, "conflict"]);
    await noDrift(one, two, asha);
});

test("delete ×3 at once, and a split ×2 at once → refunded once", async () => {
    const bank = await acc("delete bank"); const asha = await acc("Asha three", 0, "person");
    const t = await expense(bank, 40_000);
    const r = await par(3, () => send("DELETE", `/transactions/${t._id}`));
    assert.deepEqual(codes(r), [200, 404, 404]);
    const s = await expense(bank, 20_000, { owedBy: [{ account: asha, amount: 10_000 }] });
    const r2 = await par(2, () => send("DELETE", `/transactions/${s._id}`));
    assert.deepEqual(codes(r2), [200, 404]);
    assert.deepEqual([await balance(bank), await balance(asha)], [1_000_000, 0]);
    await noDrift(bank, asha);
});

test("convert one expense ×2 at once and bulk convert ×2 at once → the fund gets each amount once", async () => {
    const bank = await acc("convert bank"); const fund = await acc("convert fund", 0, "investment");
    const t = await expense(bank, 50_000);
    const r = await par(2, () => send("POST", `/transactions/${t._id}/convert-to-investment`, { toAccount: fund }));
    assert.deepEqual(codes(r), [200, 409]);
    const ids = [(await expense(bank, 20_000))._id, (await expense(bank, 20_000))._id];
    const b = await par(2, () => send("POST", "/transactions/convert-to-investment", { transactionIds: ids, toAccount: fund }));
    assert.deepEqual(b.map((x) => x.json.data.converted).sort(), [0, 2]);
    assert.equal(await balance(fund), 90_000);
    await noDrift(bank, fund);
});

test("balance sync: ×2 at once to one target ends AT it; two targets at once end at one of them", async () => {
    const bank = await acc("sync bank", 1_000_000);
    const r = await par(2, () => send("PATCH", `/accounts/${bank}/balance`, { balance: 5_000_000 }));
    assert.deepEqual(codes(r), [200, 200]);
    assert.equal(await balance(bank), 5_000_000);
    assert.equal((await rows({ account: new ObjectId(bank) })).length, 1, "one adjustment");
    const r2 = await Promise.all([7_000_000, 3_000_000].map((b) => send("PATCH", `/accounts/${bank}/balance`, { balance: b })));
    assert.ok(r2.every((x) => x.status === 200 || x.status === 409), codes(r2).join());
    assert.ok([7_000_000, 3_000_000].includes(await balance(bank)));
    await noDrift(bank);
});

test("redemptions ×2 at once from a holding worth less than both never take it below zero", async () => {
    const bank = await acc("redeem bank"); const fund = await acc("redeem fund", 100_000, "investment");
    const r = await par(2, () => send("POST", "/transactions", { type: "transfer", amount: 70_000, account: fund, toAccount: bank, occurredAt: new Date().toISOString() }));
    assert.deepEqual(codes(r), [201, 400]);
    assert.equal(await balance(fund), 30_000);
    const redeemed = (await rows({ account: new ObjectId(fund) }))[0];
    const edit = await send("PATCH", `/transactions/${redeemed._id}`, { amount: 150_000 });
    assert.equal(edit.status, 400);
    assert.equal(await balance(fund), 30_000);
    await noDrift(bank, fund);
});

test("an archived category of the user's own is still accepted on create and on an edit that changes it", async () => {
    const bank = await acc("archived-cat bank");
    const made = await send("POST", "/categories", { name: `Old ${randomUUID().slice(0, 8)}`, kind: "expense" });
    assert.equal(made.status, 201, made.json?.message);
    const old = made.json.data._id as string;
    assert.equal((await send("DELETE", `/categories/${old}`)).status, 200);
    const created = await send("POST", "/transactions", { type: "expense", amount: 1_000, account: bank, category: old, title: "queued before the archive", occurredAt: new Date().toISOString(), clientId: `w1-${randomUUID()}` });
    assert.equal(created.status, 201, created.json?.message);
    const other = await expense(bank, 2_000);
    const edited = await send("PATCH", `/transactions/${other._id}`, { category: old });
    assert.equal(edited.status, 200, edited.json?.message);
    assert.equal(edited.json.data.category, old);
    await noDrift(bank);
});

test("references: a foreign or archived account, or a missing or wrong-kind category, is a 400 invalid_reference", async () => {
    const bank = await acc("ref bank"); const gone = await acc("ref gone");
    assert.equal((await send("DELETE", `/accounts/${gone}`)).status, 200);
    const income = ((await send("GET", "/categories")).json.data as { _id: string; kind: string }[]).find((c) => c.kind === "income")!._id;
    for (const body of [
        { type: "expense", amount: 100, account: gone, category: cat, title: "x" },
        { type: "expense", amount: 100, account: bank, category: income, title: "x" },
        { type: "expense", amount: 100, account: bank, category: new ObjectId().toHexString(), title: "x" },
        { type: "expense", amount: 100, account: bank, category: cat, title: "x", owedBy: [{ account: bank === gone ? bank : gone, amount: 10 }] },
    ]) {
        const r = await send("POST", "/transactions", body);
        assert.deepEqual([r.status, r.json.code], [400, "invalid_reference"], JSON.stringify(body));
    }
    const h = await send("GET", `/investments/${bank}/history`);
    assert.deepEqual([h.status, h.json.code], [404, "not_found"]);
});
