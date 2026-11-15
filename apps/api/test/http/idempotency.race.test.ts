/**
 * Idempotency-Key on every keyed route (R2): each write sent twice with one key lands once and
 * the second send gets the first reply byte for byte; and a server that dies after the write
 * committed but before it stored the reply never writes it again. A fresh user on the
 * in-memory database (test/harness.ts); balances are read from the database.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import { useTestApi, type Reply, type Send } from "../harness";
import { client } from "../../scripts/guards/lib";
import { effectsOf } from "../../scripts/invariants/rules";
import { LOST_REPLY } from "../../src/middleware/idempotency";

const api = useTestApi();
let send: Send;
let token: () => string | null;
let userId: ObjectId;
let cat: string;

before(async () => {
    await api.ready();
    const u = await api.user("w6-idem");
    send = u.send;
    token = () => u.token;
    userId = new ObjectId(u.id);
    cat = await u.category("expense");
});
const ro = { col: (name: Parameters<typeof api.ro.col>[0]) => api.ro.col(name) };

const keyed = (key: string) => ({ headers: { "Idempotency-Key": key } });
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();
const count = (c: Parameters<typeof ro.col>[0], q: Record<string, unknown>) => ro.col(c).count({ userId, ...q });
const balance = async (id: string) => (await ro.col("accounts").find<{ balance: number }>({ _id: new ObjectId(id) }))[0].balance;
const noDrift = async () => {
    const accounts = await ro.col("accounts").find<{ _id: ObjectId; balance: number; startingBalance?: number; type: string }>({ userId });
    const txns = await ro.col("transactions").find<Parameters<typeof effectsOf>[0]>({ userId });
    const sums = new Map<string, number>();
    for (const t of txns) for (const [a, d] of effectsOf(t)) sums.set(a, (sums.get(a) ?? 0) + d);
    const off = accounts.filter((a) => a.type !== "investment" && a.balance !== (a.startingBalance ?? 0) + (sums.get(String(a._id)) ?? 0)).map((a) => String(a._id));
    assert.deepEqual(off, [], "balances that don't add up to their rows");
};
const created = (r: Reply, label: string) => { assert.ok(r.status < 300, `${label}: ${r.status} ${r.json?.code} ${r.json?.message}`); return r.json.data?._id as string; };
const acc = async (name: string, startingBalance = 1_000_000, type = "bank") => created(await send("POST", "/accounts", { name, type, startingBalance }), `account ${name}`);
const expense = async (account: string, amount: number, title: string, occurredAt = day(0)) =>
    created(await send("POST", "/transactions", { type: "expense", amount, account, category: cat, title, occurredAt }), `expense ${title}`);

/** Sends one request twice with one key: the first must succeed, the second must be its replay. */
const twice = async (label: string, method: string, p: string, body?: unknown): Promise<Reply> => {
    const key = randomUUID();
    const a = await send(method, p, body, keyed(key));
    const b = await send(method, p, body, keyed(key));
    assert.ok(a.status < 300, `${label}: ${a.status} ${a.json?.code} ${a.json?.message}`);
    assert.equal(b.status, a.status, `${label}: status`);
    assert.equal(b.text, a.text, `${label}: reply`);
    assert.equal(b.headers.get("idempotent-replayed"), "true", `${label}: replay header`);
    console.log(`# ${label}: ${a.status}, replay ${b.status} identical`);
    return a;
};

test("every keyed route: sent twice with one key, it lands once and the replay is the first reply", async () => {
    // Accounts
    const bank = (await twice("POST /accounts", "POST", "/accounts", { name: "K bank", type: "bank", startingBalance: 1_000_000 })).json.data._id as string;
    assert.equal(await count("accounts", { name: "K bank" }), 1);
    await twice("PATCH /accounts/:id/balance", "PATCH", `/accounts/${bank}/balance`, { balance: 900_000 });
    assert.equal(await balance(bank), 900_000);

    // Transactions
    const fund = await acc("K fund", 0, "investment");
    await twice("POST /transactions", "POST", "/transactions", { type: "expense", amount: 1_000, account: bank, category: cat, title: "K once", occurredAt: day(0) });
    assert.equal(await count("transactions", { title: "K once" }), 1);
    const edit = await expense(bank, 1_000, "K edit");
    await twice("PATCH /transactions/:id", "PATCH", `/transactions/${edit}`, { amount: 2_000 });
    const one = await expense(bank, 5_000, "K convert");
    await twice("POST /transactions/:id/convert-to-investment", "POST", `/transactions/${one}/convert-to-investment`, { toAccount: fund });
    const bulk = [await expense(bank, 3_000, "K bulk a"), await expense(bank, 3_000, "K bulk b")];
    await twice("POST /transactions/convert-to-investment", "POST", "/transactions/convert-to-investment", { transactionIds: bulk, toAccount: fund });
    assert.equal(await balance(fund), 11_000);
    const doomed = await expense(bank, 700, "K delete");
    const before = await balance(bank);
    await twice("DELETE /transactions/:id", "DELETE", `/transactions/${doomed}`);
    assert.equal(await balance(bank), before + 700);

    // Categories, budgets, bills, goals
    await twice("POST /categories", "POST", "/categories", { name: "K Pets", kind: "expense", icon: "paw", color: "amber" });
    assert.equal(await count("categories", { name: "K Pets" }), 1);
    await twice("POST /budgets", "POST", "/budgets", { category: cat, month: day(0).slice(0, 7), limit: 100_000 });
    const bill = (await twice("POST /bills", "POST", "/bills", { name: "K rent", amount: 20_000, dueDate: day(-70), recurring: true, frequency: "monthly", reminderDays: 0, category: cat, toInvestment: null, account: bank })).json.data._id as string;
    assert.equal(await count("bills", { name: "K rent" }), 1);
    const paidBefore = await count("transactions", { title: "K rent" });
    await twice("POST /bills/:id/pay", "POST", `/bills/${bill}/pay`, { account: bank });
    assert.equal(await count("transactions", { title: "K rent" }), paidBefore + 1);
    const due = (await ro.col("bills").find<{ dueDate: Date }>({ _id: new ObjectId(bill) }))[0].dueDate;
    await twice("POST /bills/:id/skip", "POST", `/bills/${bill}/skip`);
    const dueAfter = (await ro.col("bills").find<{ dueDate: Date }>({ _id: new ObjectId(bill) }))[0].dueDate;
    assert.equal(new Date(dueAfter).getUTCMonth(), (new Date(due).getUTCMonth() + 1) % 12, "skipped one period");
    const goal = (await twice("POST /goals", "POST", "/goals", { name: "K goal", target: 1_000_000, icon: "star", color: "blue" })).json.data._id as string;
    assert.equal(await count("goals", { name: "K goal" }), 1);
    await twice("POST /goals/:id/contribute", "POST", `/goals/${goal}/contribute`, { amount: 10_000 });
    assert.equal((await ro.col("goals").find<{ saved: number }>({ _id: new ObjectId(goal) }))[0].saved, 10_000);

    // Investments
    await twice("PATCH /investments/:id/basis", "PATCH", `/investments/${fund}/basis`, { invested: 11_000 });
    const gone = await acc("K gone", 0, "investment");
    await send("POST", "/transactions", { type: "transfer", amount: 4_000, account: bank, toAccount: gone, occurredAt: day(0) });
    const beforeUndo = await balance(bank);
    await twice("DELETE /investments/:id", "DELETE", `/investments/${gone}?mode=undo`);
    assert.equal(await balance(bank), beforeUndo + 4_000);

    // Trips
    const asha = await acc("K Asha", 0, "person");
    const trip = (await twice("POST /trips", "POST", "/trips", { name: "K trip", emoji: "🧳", color: "teal", startDate: day(-2), endDate: day(2), members: [asha], budget: null })).json.data._id as string;
    assert.equal(await count("trips", { name: "K trip" }), 1);
    const exp = { title: "K villa", occurredAt: day(0), category: null, cost: 20_000, paidBy: null, paidFrom: bank, shares: [{ account: null, amount: 10_000 }, { account: asha, amount: 10_000 }] };
    const e1 = (await twice("POST /trips/:id/expenses", "POST", `/trips/${trip}/expenses`, exp)).json.data._id as string;
    assert.equal(await count("tripexpenses", { tripId: new ObjectId(trip) }), 1);
    await twice("PATCH /trips/:id/expenses/:expenseId", "PATCH", `/trips/${trip}/expenses/${e1}`, { ...exp, cost: 30_000, shares: [{ account: null, amount: 15_000 }, { account: asha, amount: 15_000 }] });
    const e2 = created(await send("POST", `/trips/${trip}/expenses`, { ...exp, title: "K snack" }), "snack");
    await twice("DELETE /trips/:id/expenses/:expenseId", "DELETE", `/trips/${trip}/expenses/${e2}`);
    await twice("POST /trips/:id/settle", "POST", `/trips/${trip}/settle`, { person: asha, account: bank, amount: 5_000, direction: "received" });
    assert.equal(await balance(asha), 10_000);
    await twice("PUT /trips/:id/plan", "PUT", `/trips/${trip}/plan`, { entries: [{ account: asha, amount: 10_000 }] });
    await twice("DELETE /trips/:id/plan", "DELETE", `/trips/${trip}/plan`);
    await twice("POST /trips/:id/close", "POST", `/trips/${trip}/close`, { letGo: [asha] });
    assert.equal(await balance(asha), 0);
    await send("POST", `/trips/${trip}/reopen`);
    const csv = [
        "Date,Description,Category,Cost,Currency,K Me,K Asha", "",
        `${day(-1).slice(0, 10)},K lunch,Dining out,900.00,INR,-450.00,450.00`, "",
        `${day(0).slice(0, 10)},Total balance, , ,INR,-450.00,450.00`,
    ].join("\n");
    const mapping = { "K Me": "me", "K Asha": asha };
    const pre = await send("POST", `/trips/${trip}/import/preview`, { csv, mapping });
    const decisions = (pre.json.data.rows as { key: string; suggestedCategory: string | null }[]).map((r) => ({ key: r.key, action: "import", category: r.suggestedCategory }));
    const before2 = await count("tripexpenses", { tripId: new ObjectId(trip) });
    await twice("POST /trips/:id/import/commit", "POST", `/trips/${trip}/import/commit`, { csv, mapping, decisions });
    assert.equal(await count("tripexpenses", { tripId: new ObjectId(trip) }), before2 + 1);
    await twice("DELETE /trips/:id", "DELETE", `/trips/${trip}`);
    assert.equal(await count("trips", { _id: new ObjectId(trip) }), 0);

    // Restore, last: it replaces everything this user has.
    const backup = (await send("GET", "/backup")).json.data;
    await twice("POST /backup/restore", "POST", "/backup/restore", { ...backup, confirm: true });

    await noDrift();
});

test("crash after the commit, before the reply is stored: the retry never writes again", async () => {
    const bank = await acc("K crash bank");
    const body = { type: "expense", amount: 4_200, account: bank, category: cat, title: "K crash", occurredAt: day(0) };
    const key = randomUUID();

    const crashing = await api.child({ IDEMPOTENCY_TEST_CRASH: "after-commit" });
    let answer: string;
    try { answer = String((await client(crashing.base, token)("POST", "/transactions", body, keyed(key))).status); }
    catch (e) { answer = `no answer (${(e as Error).message})`; }
    console.log(`# first send, to the API that dies after committing: ${answer}`);
    assert.match(answer, /^no answer/);
    assert.equal(await crashing.exited, 70);
    assert.equal(await count("transactions", { title: "K crash" }), 1, "the write committed before the crash");

    const soon = await send("POST", "/transactions", body, keyed(key));
    console.log(`# retry inside the lease: ${soon.status} ${soon.json?.code}`);
    assert.equal(soon.status, 409);
    assert.equal(soon.json.code, "idempotency_in_progress");

    // The lease ends LEASE_MS after the claim; moved into the past rather than waited out.
    const moved = await api.db().collection("idempotencyrecords").updateOne({ userId, key }, { $set: { lockedUntil: new Date(Date.now() - 1_000) } });
    assert.equal(moved.modifiedCount, 1);
    const later = await send("POST", "/transactions", body, keyed(key));
    console.log(`# retry after the lease: ${later.status} ${later.text}`);
    assert.equal(later.status, 200);
    assert.equal(later.text, LOST_REPLY);
    assert.equal(later.headers.get("idempotent-replayed"), "true");
    const again = await send("POST", "/transactions", body, keyed(key));
    assert.equal(again.text, LOST_REPLY);
    assert.equal(await count("transactions", { title: "K crash" }), 1, "never written twice");
    await noDrift();
});
