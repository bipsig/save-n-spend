import { before, test } from "node:test";
import assert from "node:assert/strict";
import { useTestApi, type Send, type TestUser } from "../harness";
import { failed } from "./moneyChecks";

// "Saved · Undo" (2.8.7): the app sends the previous values back with `If-Match: <updatedAt>`
// from its save. Same time: the undo lands. Written since: 409 `conflict`, nothing written.
// No header: the PATCH behaves as it always has (2.8.5).

const api = useTestApi();
let me: TestUser;
let send: Send;
const CHANGED = "This changed after you saved it, so it wasn't undone";
const match = (at: string) => ({ headers: { "If-Match": at } });

before(async () => {
    await api.ready();
    me = await api.user("if-match");
    send = me.send;
});

type Case = { name: string; path: () => Promise<string>; first: unknown; second: unknown; undo: unknown; read: (data: any) => unknown };

/** Save, undo with the save's updatedAt (lands); save again, then undo with a stale one (refused). */
const check = async ({ path, first, second, undo, read }: Case) => {
    const p = await path();
    const saved = await send("PATCH", p, first);
    assert.equal(saved.status, 200, saved.text);
    const at = saved.json.data.updatedAt as string;
    assert.equal(typeof at, "string");

    const undone = await send("PATCH", p, undo, match(at));
    assert.equal(undone.status, 200, undone.text);
    assert.deepEqual(read(undone.json.data), read(undo));

    // Written after the undo's own reply: an undo carrying the older time is refused.
    const stale = undone.json.data.updatedAt as string;
    assert.equal((await send("PATCH", p, second)).status, 200);
    failed(await send("PATCH", p, undo, match(stale)), 409, "conflict", { message: CHANGED });
    // Quoted like an ETag, and without the header at all, both still work.
    const now = (await send("PATCH", p, second)).json.data.updatedAt as string;
    assert.equal((await send("PATCH", p, undo, match(`"${now}"`))).status, 200);
    assert.equal((await send("PATCH", p, second)).status, 200);
    failed(await send("PATCH", p, undo, match("yesterday")), 400, "invalid_input", { path: "If-Match" });
};

const create = async (path: string, body: unknown) => {
    const r = await send("POST", path, body);
    assert.ok(r.status === 201 || r.status === 200, r.text);
    return r.json.data._id as string;
};

test("goal edit undo", () => check({
    name: "goal",
    path: async () => `/goals/${await create("/goals", { name: "Bike", target: 500_000 })}`,
    first: { name: "Bike fund", target: 600_000 }, second: { name: "Bike 2" }, undo: { name: "Bike", target: 500_000 },
    read: (d) => [d.name, d.target],
}));

test("bill edit undo", async () => {
    const account = await me.account("If bank");
    const category = await me.category("expense");
    const due = new Date(Date.UTC(2026, 11, 11)).toISOString();
    await check({
        name: "bill",
        path: async () => `/bills/${await create("/bills", { name: "Rent", amount: 2_000_000, account, category, dueDate: due })}`,
        first: { amount: 2_100_000 }, second: { name: "Rent 2" }, undo: { name: "Rent", amount: 2_000_000 },
        read: (d) => [d.name, d.amount],
    });
});

test("budget limit undo", async () => {
    const category = await me.category("expense");
    const month = new Date().toISOString().slice(0, 7);
    await check({
        name: "budget",
        path: async () => `/budgets/${await create("/budgets", { category, month, limit: 500_000 })}`,
        first: { limit: 600_000 }, second: { limit: 700_000 }, undo: { limit: 500_000 },
        read: (d) => d.limit,
    });
});

test("category edit undo", () => check({
    name: "category",
    path: async () => `/categories/${await create("/categories", { name: "Pets", kind: "expense", icon: "paw", color: "teal" })}`,
    first: { name: "Pet care" }, second: { name: "Pets 2" }, undo: { name: "Pets", icon: "paw", color: "teal" },
    read: (d) => d.name,
}));

test("account edit undo", () => check({
    name: "account",
    path: async () => `/accounts/${await me.account("Wallet A", { type: "wallet" })}`,
    first: { name: "Wallet B" }, second: { name: "Wallet C" }, undo: { name: "Wallet A", type: "wallet" },
    read: (d) => d.name,
}));

test("transaction edit undo", async () => {
    const account = await me.account("Txn bank");
    const category = await me.category("expense");
    await check({
        name: "transaction",
        path: async () => `/transactions/${await create("/transactions", { type: "expense", amount: 45_000, account, category, title: "Zepto" })}`,
        first: { amount: 50_000, title: "Zepto 2" }, second: { note: "later" }, undo: { amount: 45_000, title: "Zepto" },
        read: (d) => [d.amount, d.title],
    });
});

test("an account balance moved by a new transaction refuses an undo carrying the earlier time", async () => {
    const id = await me.account("Moved bank");
    const saved = await send("PATCH", `/accounts/${id}`, { name: "Moved bank 2" });
    await send("POST", "/transactions", { type: "income", amount: 1_000, account: id, category: await me.category("income"), title: "Pay" });
    failed(await send("PATCH", `/accounts/${id}`, { name: "Moved bank" }, match(saved.json.data.updatedAt)), 409, "conflict", { message: CHANGED });
    const doc = (await api.ro.col("accounts").find<{ name: string }>({ name: { $in: ["Moved bank", "Moved bank 2"] } }))[0];
    assert.equal(doc.name, "Moved bank 2");
});

test("trip, trip expense and close date undo", async () => {
    const friend = await me.account("Ravi", { type: "person" });
    const bank = await me.account("Trip bank");
    const day = (n: number) => new Date(Date.UTC(2026, 10, 10 + n)).toISOString();
    const tripId = await create("/trips", { name: "Goa", startDate: day(0), endDate: day(3), members: [friend] });
    await check({
        name: "trip",
        path: async () => `/trips/${tripId}`,
        first: { name: "Goa 2026" }, second: { name: "Goa again" }, undo: { name: "Goa" },
        read: (d) => d.name,
    });

    const expense = (cost: number, title: string) => ({ title, occurredAt: day(1), cost, paidBy: null, paidFrom: bank, shares: [{ account: null, amount: cost / 2 }, { account: friend, amount: cost / 2 }] });
    const expenseId = await create(`/trips/${tripId}/expenses`, expense(300_000, "Dinner"));
    await check({
        name: "trip expense",
        path: async () => `/trips/${tripId}/expenses/${expenseId}`,
        first: expense(400_000, "Dinner out"), second: expense(500_000, "Dinner 2"), undo: expense(300_000, "Dinner"),
        read: (d) => [d.title, d.cost, d.shares.map((s: { amount: number }) => s.amount)],
    });

    // The close date: the reply now carries the trip (data was null before 2.8.7).
    await send("PATCH", `/trips/${tripId}/expenses/${expenseId}`, expense(300_000, "Dinner"));
    assert.equal((await send("POST", `/trips/${tripId}/close`, { letGo: [], closedOn: "2026-11-12" })).status, 200);
    const moved = await send("PATCH", `/trips/${tripId}/close-date`, { closedOn: "2026-11-13" });
    assert.equal(moved.status, 200, moved.text);
    assert.equal(moved.json.data._id, tripId);
    const back = await send("PATCH", `/trips/${tripId}/close-date`, { closedOn: "2026-11-12" }, match(moved.json.data.updatedAt));
    assert.equal(back.status, 200, back.text);
    failed(await send("PATCH", `/trips/${tripId}/close-date`, { closedOn: "2026-11-13" }, match(moved.json.data.updatedAt)), 409, "conflict", { message: CHANGED });
});
