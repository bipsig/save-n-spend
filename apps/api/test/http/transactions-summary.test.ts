import { before, test } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { useTestApi, type TestUser } from "../harness";
import { dayBoundsFromKeyInZone } from "../../src/utils/timezone";
import { failed } from "./readHelpers";

// GET /transactions and GET /transactions/summary together: the Activity card must total
// exactly the rows of the list beneath it, for every filter. Rules (Sagnik, 16 Nov): only
// income and expense rows count; a transfer lists under either of its accounts but never
// counts; balance corrections neither list nor count.

const api = useTestApi();
let me: TestUser;
let other: TestUser;
const id: Record<string, string> = {};

type Row = { _id: string; type: string; amount: number; account: string; toAccount?: string | null; userId?: string };
type Query = Record<string, string | undefined>;
type Totals = { income: number; expenses: number; savings: number; tripExpenses: number };

const day = (d: number) => new Date(Date.UTC(2026, 10, d, 6)).toISOString();
const NOV = { startDate: "2026-11-01", endDate: "2026-11-30" };
const ZONE = "Asia/Kolkata";
const qs = (q: Query) => new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => e[1] !== undefined)).toString();

before(async () => {
    await api.ready();
    me = await api.user("t-activity");
    other = await api.user("t-activity-other");

    const cats = (await me.send("GET", "/categories")).json.data as { _id: string; kind: string; parent?: string | null }[];
    const kids = (p: string) => cats.filter((c) => c.parent === p).map((c) => c._id);
    const [food, travel] = cats.filter((c) => c.kind === "expense" && !c.parent && kids(c._id).length >= 2).map((c) => c._id);
    Object.assign(id, { food, travel, foodA: kids(food)[0], foodB: kids(food)[1], travelA: kids(travel)[0], salary: await me.category("income") });

    id.bank = await me.account("HDFC Bank", { startingBalance: 50_000_00 });
    id.card = await me.account("ICICI Card", { type: "credit_card", startingBalance: 0 });
    id.wallet = await me.account("Wallet", { type: "wallet", startingBalance: 5_000_00 });
    id.ravi = await me.account("Ravi", { type: "person", startingBalance: 0 });

    const post = async (body: Record<string, unknown>) => {
        const r = await me.send("POST", "/transactions", body);
        assert.equal(r.status, 201, r.text);
    };
    const ex = (title: string, amount: number, category: string, account: string, occurredAt: string) =>
        post({ type: "expense", title, amount, category, account, occurredAt });
    const inc = (title: string, amount: number, account: string, occurredAt: string) =>
        post({ type: "income", title, amount, category: id.salary, account, occurredAt });

    // A sub-category archived after use: its rows still list under Food, so they still count there.
    const oldCafe = await me.send("POST", "/categories", { name: "Old cafe", kind: "expense", parent: id.food });
    assert.equal(oldCafe.status, 201, oldCafe.text);
    id.oldCafe = oldCafe.json.data._id;
    await ex("Old cafe", 250_00, id.oldCafe, id.bank, day(8));
    assert.equal((await me.send("DELETE", `/categories/${id.oldCafe}`)).status, 200);

    await inc("Salary November", 1_20_000_00, id.bank, day(1));
    await inc("Refund from Big Basket", 350_00, id.card, day(9));
    await ex("Big Basket", 2_450_00, id.foodA, id.bank, day(2));
    await ex("big basket refill", 640_00, id.foodA, id.card, day(5));
    await ex("Swiggy dinner", 780_00, id.foodB, id.card, day(6));
    await ex("Chai (office)", 40_00, id.foodB, id.wallet, day(7));
    await ex("Snacks", 120_00, id.food, id.wallet, day(8));
    await ex("Uber to airport", 900_00, id.travelA, id.card, day(10));
    await ex("Metro card", 500_00, id.travelA, id.bank, day(11));
    // IST midnight between 31 Oct and 1 Nov is 18:30 UTC on 31 Oct.
    await ex("Midnight Big Basket", 210_00, id.foodA, id.bank, "2026-10-31T18:40:00.000Z");
    await ex("Late October basket", 330_00, id.foodA, id.bank, "2026-10-31T18:20:00.000Z");
    await inc("October salary", 1_20_000_00, id.bank, "2026-10-01T06:00:00.000Z");
    await post({ type: "transfer", amount: 5_000_00, account: id.bank, toAccount: id.card, occurredAt: day(13) });
    await post({ type: "transfer", amount: 2_000_00, account: id.wallet, toAccount: id.bank, occurredAt: day(14) });
    const fix = await me.send("PATCH", `/accounts/${id.wallet}/balance`, { balance: 12_345_00, note: "Basket correction" });
    assert.equal(fix.status, 200, fix.text);

    // A trip: each expense is my share (an expense on the trip) and what Ravi owes (a transfer).
    const trip = await me.send("POST", "/trips", { name: "Goa", startDate: "2026-11-03", endDate: "2026-11-04", members: [id.ravi], budget: null });
    assert.equal(trip.status, 201, trip.text);
    for (const [title, cost, category, paidFrom, d] of [["Goa basket dinner", 6_000_00, id.foodB, id.bank, 3], ["Scooter", 1_000_00, id.travelA, id.card, 4]] as const) {
        const e = await me.send("POST", `/trips/${trip.json.data._id}/expenses`, {
            title, occurredAt: day(d), category, cost, paidBy: null, paidFrom,
            shares: [{ account: null, amount: cost / 2 }, { account: id.ravi, amount: cost / 2 }],
        });
        assert.equal(e.status, 201, e.text);
    }

    // Someone else's, in neither the list nor the card.
    const theirs = await other.account("Their bank");
    for (const type of ["expense", "income"] as const) {
        const r = await other.send("POST", "/transactions", { type, title: "Big Basket", amount: 99_999, category: await other.category(type), account: theirs, occurredAt: day(2) });
        assert.equal(r.status, 201, r.text);
    }
});

/** Every page of GET /transactions, three rows a page so most cases span several. */
const listAll = async (q: Query): Promise<Row[]> => {
    const out: Row[] = [];
    for (let page = 1; ; page++) {
        const r = await me.send("GET", `/transactions?${qs({ ...q, page: String(page), limit: "3" })}`);
        assert.equal(r.status, 200, r.text);
        out.push(...r.json.data.items);
        if (!r.json.data.hasNextPage) {
            assert.equal(out.length, r.json.data.total, "every page adds up to the total");
            break;
        }
    }
    assert.equal(new Set(out.map((r) => r._id)).size, out.length, "no row on two pages");
    return out;
};

const summary = async (q: Query, u: TestUser = me): Promise<Totals> => {
    const r = await u.send("GET", `/transactions/summary?${qs(q)}`);
    assert.equal(r.status, 200, r.text);
    return r.json.data;
};

const total = (rows: Row[], type: string) => rows.filter((r) => r.type === type).reduce((s, r) => s + r.amount, 0);

const CASES: Record<string, () => Query> = {
    "no filter, all time": () => ({}),
    "no filter, November": () => ({ ...NOV }),
    "category: a parent takes its children, archived ones too": () => ({ ...NOV, category: id.food }),
    "category: one sub-category": () => ({ ...NOV, category: id.foodA }),
    "category: an archived sub-category": () => ({ ...NOV, category: id.oldCafe }),
    "category: two sub-categories": () => ({ ...NOV, category: `${id.foodA},${id.foodB}` }),
    "account: one": () => ({ ...NOV, account: id.card }),
    "account: two": () => ({ ...NOV, account: `${id.card},${id.wallet}` }),
    "type: expense": () => ({ ...NOV, type: "expense" }),
    "type: income": () => ({ ...NOV, type: "income" }),
    "type: transfer": () => ({ ...NOV, type: "transfer" }),
    "search: case-insensitive substring": () => ({ ...NOV, search: "BASKET" }),
    "search: regex characters are literal": () => ({ ...NOV, search: "(office)" }),
    "search: matches nothing": () => ({ ...NOV, search: "zzz" }),
    "combined: category + account + type + search": () => ({ ...NOV, category: id.food, account: id.card, type: "expense", search: "basket" }),
    "combined: account + search, all time": () => ({ account: id.bank, search: "basket" }),
    "range edge: 1 November in IST": () => ({ startDate: "2026-11-01", endDate: "2026-11-01" }),
};

for (const [name, query] of Object.entries(CASES)) {
    test(`summary = sum of every page of the list: ${name}`, async () => {
        const f = query();
        // Activity's own view is the everyday one (trips: exclude).
        const [everyday, all, tripOnly, card] = await Promise.all([
            listAll({ ...f, trips: "exclude" }), listAll(f), listAll({ ...f, trips: "only" }), summary({ ...f, trips: "exclude" }),
        ]);
        assert.equal(card.income, total(everyday, "income"), "income");
        assert.equal(card.expenses, total(everyday, "expense"), "expenses");
        assert.equal(card.tripExpenses, total(tripOnly, "expense"), "trip line");
        // Savings counts the trip rows the same filters pick ("counted in savings").
        assert.equal(card.savings, total(all, "income") - total(all, "expense"), "savings");
        assert.ok(all.every((r) => r.type !== "positiveAdjustment" && r.type !== "negativeAdjustment"), "no balance corrections");

        // The trip view and the unnarrowed one total their own rows too.
        const [only, unset] = await Promise.all([summary({ ...f, trips: "only" }), summary(f)]);
        assert.deepEqual([only.income, only.expenses], [total(tripOnly, "income"), total(tripOnly, "expense")], "trips: only");
        assert.deepEqual([unset.income, unset.expenses], [total(all, "income"), total(all, "expense")], "trips unset");
    });
}

test("the figures themselves, worked by hand", async () => {
    const ex = (q: Query) => summary({ ...q, trips: "exclude" });
    // Everyday November: two incomes; nine expenses (with the archived Old cafe and 1 Nov 00:10 IST); trips ₹3,000 + ₹500.
    assert.deepEqual(await ex(NOV), { income: 1_20_350_00, expenses: 5_890_00, savings: 1_20_350_00 - 5_890_00 - 3_500_00, tripExpenses: 3_500_00 });
    // Food and every child, archived Old cafe included; the Goa dinner share is Food on a trip.
    assert.deepEqual(await ex({ ...NOV, category: id.food }), { income: 0, expenses: 4_490_00, savings: -4_490_00 - 3_000_00, tripExpenses: 3_000_00 });
    assert.deepEqual(await ex({ ...NOV, category: id.oldCafe }), { income: 0, expenses: 250_00, savings: -250_00, tripExpenses: 0 });
    assert.deepEqual(await ex({ ...NOV, search: "BASKET" }), { income: 350_00, expenses: 3_300_00, savings: 350_00 - 3_300_00 - 3_000_00, tripExpenses: 3_000_00 });
    assert.deepEqual(await ex({ ...NOV, search: "(office)" }), { income: 0, expenses: 40_00, savings: -40_00, tripExpenses: 0 });
    // October ends at 23:50 IST on the 31st, which is 18:20 UTC.
    assert.deepEqual(await ex({ startDate: "2026-10-01", endDate: "2026-10-31" }), { income: 1_20_000_00, expenses: 330_00, savings: 1_20_000_00 - 330_00, tripExpenses: 0 });
});

test("transfers list under either account but never add to a figure", async () => {
    const transfers = await listAll({ ...NOV, type: "transfer", trips: "exclude" });
    assert.equal(transfers.length, 2);
    // Type = Transfer: every figure is zero (the app shows a dash).
    assert.deepEqual(await summary({ ...NOV, type: "transfer", trips: "exclude" }), { income: 0, expenses: 0, savings: 0, tripExpenses: 0 });

    // The card is only the receiving side of bank → card; the transfer still lists.
    const onCard = await listAll({ ...NOV, account: id.card, trips: "exclude" });
    assert.ok(onCard.some((r) => r.type === "transfer" && r.toAccount === id.card && r.account === id.bank), "received transfer lists");
    assert.deepEqual(await summary({ ...NOV, account: id.card, trips: "exclude" }), { income: 350_00, expenses: 2_320_00, savings: 350_00 - 2_320_00 - 500_00, tripExpenses: 500_00 });

    // The wallet: two expenses and a transfer out list; its balance correction doesn't.
    const onWallet = await listAll({ ...NOV, account: id.wallet, trips: "exclude" });
    assert.deepEqual(onWallet.map((r) => r.type).sort(), ["expense", "expense", "transfer"]);
    assert.deepEqual(await summary({ ...NOV, account: id.wallet, trips: "exclude" }), { income: 0, expenses: 160_00, savings: -160_00, tripExpenses: 0 });
});

test("without filters the figures follow the pre-2.8.1 rule", async () => {
    // The old summary's match, read straight from the database: the caller's income and
    // expense rows in the zone-local range, narrowed only by `trips`.
    const rows = await api.ro.col("transactions").find<{ type: string; amount: number; occurredAt: Date; tripId?: unknown }>(
        { userId: new ObjectId(me.id), type: { $in: ["income", "expense"] } });
    const before = (range: { startDate?: string; endDate?: string }, trips?: "exclude" | "only"): Totals => {
        const inRange = rows.filter((r) => !range.startDate || !range.endDate ||
            (r.occurredAt >= dayBoundsFromKeyInZone(range.startDate, ZONE).start && r.occurredAt <= dayBoundsFromKeyInZone(range.endDate, ZONE).end));
        const onTrip = (r: { tripId?: unknown }) => r.tripId != null;
        const inView = (r: { tripId?: unknown }) => (trips === "exclude" ? !onTrip(r) : trips === "only" ? onTrip(r) : true);
        const sum = (type: string, keep: (r: { tripId?: unknown }) => boolean) => inRange.filter((r) => r.type === type && keep(r)).reduce((s, r) => s + r.amount, 0);
        return { income: sum("income", inView), expenses: sum("expense", inView), savings: sum("income", () => true) - sum("expense", () => true), tripExpenses: sum("expense", onTrip) };
    };
    for (const range of [{}, NOV, { startDate: "2026-11-01", endDate: "2026-11-01" }, { startDate: "2026-10-01", endDate: "2026-10-31" }]) {
        for (const trips of [undefined, "exclude", "only"] as const) {
            assert.deepEqual(await summary({ ...range, trips }), before(range, trips), `${JSON.stringify(range)} trips=${trips}`);
        }
    }
});

test("only the caller's rows, under the same filters", async () => {
    assert.deepEqual(await summary({ ...NOV, search: "basket", trips: "exclude" }, other), { income: 99_999, expenses: 99_999, savings: 0, tripExpenses: 0 });
    // My filter naming their account: the id is valid, it simply matches none of my rows.
    const theirAccount = (await other.send("GET", "/accounts")).json.data;
    const theirs = (Array.isArray(theirAccount) ? theirAccount : theirAccount.items).find((a: { name: string }) => a.name === "Their bank")._id;
    assert.deepEqual(await listAll({ ...NOV, account: theirs }), []);
    assert.deepEqual(await summary({ ...NOV, account: theirs }), { income: 0, expenses: 0, savings: 0, tripExpenses: 0 });
});

test("the summary refuses the same bad filters as the list, and drops unknown ones", async () => {
    const bads: [Query, string][] = [
        [{ category: "nope" }, "invalid_reference"], [{ account: `${id.bank},x` }, "invalid_reference"],
        [{ type: "positiveAdjustment" }, "invalid_input"], [{ search: "x".repeat(81) }, "invalid_input"], [{ startDate: "2026-11-01" }, "invalid_input"],
    ];
    for (const [bad, code] of bads) {
        for (const path of ["/transactions", "/transactions/summary"]) {
            const r = await me.send("GET", `${path}?${qs(bad)}`);
            assert.deepEqual([r.status, r.json.code], [400, code], `${path} ${JSON.stringify(bad)}: ${r.text}`);
        }
    }
    // Unknown parameters are dropped, as on every route (see validate), not refused.
    assert.deepEqual(await summary({ ...NOV, page: "2", foo: "1" }), await summary(NOV));
    failed(await api.send("GET", `/transactions/summary?${qs(NOV)}`), 401, "unauthenticated");
});
