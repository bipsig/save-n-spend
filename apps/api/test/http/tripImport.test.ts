import { before, test } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { useTestApi, type TestUser } from "../harness";
import { failed } from "./moneyChecks";

// The Splitwise import's name guesses (preview without a mapping), "you paid" rows lined up with
// your own entries (one, or several that add up) and applied on commit, and rows already
// imported. The user signs up as "Test Runner" (test/harness.ts).

const api = useTestApi();
let me: TestUser;
let bank: string;
let asha: string;
let ravi: string;
let trip: string;

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const csvOf = (people: string[], rows: string[]) => [`Date,Description,Category,Cost,Currency,${people.join(",")}`, "", ...rows].join("\n");
type Row = { key: string; status: string; title: string; cost: number; matches?: { id: string; title: string; cost: number }[] };
type Stored = { _id: ObjectId; title: string; cost: number; importKey: string | null; shares: { account: ObjectId | null; amount: number }[] };
const expenses = async () => api.ro.col("tripexpenses").find<Stored>({ tripId: new ObjectId(trip) });
const counts = async () => Promise.all((["accounts", "transactions", "tripexpenses", "trips"] as const).map((c) => api.ro.col(c).count({ userId: new ObjectId(me.id) })));

/** One of your own trip entries that you paid in full, unsplit. */
const mine = async (title: string, cost: number) => {
    const r = await me.send("POST", `/trips/${trip}/expenses`, { title, occurredAt: new Date().toISOString(), category: null, cost, paidBy: null, paidFrom: bank, shares: [{ account: null, amount: cost }] });
    assert.equal(r.status, 201, r.text);
    return r.json.data._id as string;
};

before(async () => {
    await api.ready();
    me = await api.user("import");
    bank = await me.account("Import bank", { startingBalance: 10_000_000 });
    asha = await me.account("Asha Rao", { type: "person", startingBalance: 0 });
    ravi = await me.account("Ravi Kumar", { type: "person", startingBalance: 0 });
    const r = await me.send("POST", "/trips", { name: "Kerala", startDate: new Date(Date.now() - 5 * 86_400_000).toISOString(), endDate: new Date().toISOString(), members: [asha, ravi], budget: null });
    assert.equal(r.status, 201, r.text);
    trip = r.json.data._id;
});

test("preview without a mapping: who's who is guessed by full name, then first name; nobody else is matched; nothing is written", async () => {
    const zed = await me.account("Zed Old", { type: "person", startingBalance: 0 });
    assert.equal((await me.send("DELETE", `/accounts/${zed}`)).status, 200);
    const people = ["Test R.", "asha rao", "Ravi", "Zed Old", "Newbie"];
    const csv = csvOf(people, [`${day(-1)},Cab,Taxi,500.00,INR,-100.00,400.00,-100.00,-100.00,-100.00`]);
    const before = await counts();

    const r = await me.send("POST", `/trips/${trip}/import/preview`, { csv });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.json.data, {
        needsMapping: true,
        people,
        // "Test R." is you by first name; "asha rao" is Asha Rao whatever the case; "Ravi" is Ravi
        // Kumar by first name; an archived person isn't offered, so Zed is new.
        suggested: { "Test R.": "me", "asha rao": asha, Ravi: ravi, "Zed Old": "new", Newbie: "new" },
    });
    const exact = await me.send("POST", `/trips/${trip}/import/preview`, { csv: csvOf(["Test Runner", "Asha Rao"], [`${day(-1)},Cab,Taxi,500.00,INR,-250.00,250.00`]) });
    assert.deepEqual(exact.json.data.suggested, { "Test Runner": "me", "Asha Rao": asha });
    assert.deepEqual(await counts(), before);

    failed(await me.send("POST", `/trips/${trip}/import/preview`, { csv, mapping: { "Test R.": asha } }), 400, "invalid_input", { message: "Pick which name is you", path: "mapping" });
});

const PEOPLE = ["Test Runner", "Asha Rao", "Ravi Kumar"];
const ROWS = [
    `${day(-2)},Houseboat,Hotel,3000.00,INR,2000.00,-1000.00,-1000.00`, // you paid; one entry of yours is ₹3,000
    `${day(-2)},Dinner,Dining out,900.00,INR,600.00,-300.00,-300.00`, //    you paid; two entries of yours add up to ₹900
    `${day(-1)},Fuel,Gas/fuel,123.00,INR,82.00,-41.00,-41.00`, //           you paid; nothing of yours is left to match
    `${day(-1)},Cab,Taxi,600.00,INR,-300.00,600.00,-300.00`, //             Asha paid
    `${day(-1)},Payment,Payment,500.00,INR,-500.00,500.00,0.00`, //         Asha paid you back
];
const mapping = () => ({ "Test Runner": "me", "Asha Rao": asha, "Ravi Kumar": ravi });

test("preview, commit and preview again: your entries are matched and take the split; imported rows read as already in", async () => {
    const houseboat = await mine("Houseboat (mine)", 300_000);
    const dinnerA = await mine("Dinner starters", 40_000);
    const dinnerB = await mine("Dinner mains", 50_000);
    // Split already: not one of "your" entries, so never matched.
    const split = await me.send("POST", `/trips/${trip}/expenses`, { title: "Already split", occurredAt: new Date().toISOString(), category: null, cost: 90_000, paidBy: null, paidFrom: bank, shares: [{ account: null, amount: 45_000 }, { account: asha, amount: 45_000 }] });
    assert.equal(split.status, 201);
    const csv = csvOf(PEOPLE, ROWS);

    const pre = await me.send("POST", `/trips/${trip}/import/preview`, { csv, mapping: mapping() });
    assert.equal(pre.status, 200, pre.text);
    const rows = pre.json.data.rows as Row[];
    assert.deepEqual(rows.map((r) => r.status), ["matchesYours", "matchesYours", "pickAccount", "ready", "settlement"]);
    assert.deepEqual(rows[0].matches, [{ id: houseboat, title: "Houseboat (mine)", cost: 300_000 }]);
    assert.deepEqual(rows[1].matches!.map((m) => m.id).sort(), [dinnerA, dinnerB].sort());
    assert.equal(rows[2].matches, undefined);
    assert.equal(pre.json.data.needsMapping, false);

    const decisions = [
        { key: rows[0].key, action: "apply" },
        { key: rows[1].key, action: "apply" },
        // "apply" on a row with nothing of yours to apply to does nothing.
        { key: rows[2].key, action: "apply" },
        { key: rows[3].key, action: "import", category: null },
        { key: rows[4].key, action: "import", account: bank },
    ];
    const commit = await me.send("POST", `/trips/${trip}/import/commit`, { csv, mapping: mapping(), decisions });
    assert.equal(commit.status, 200, commit.text);
    assert.deepEqual([commit.json.data.added, commit.json.data.applied, commit.json.data.settled], [1, 3, 1]);

    const stored = new Map((await expenses()).map((e) => [String(e._id), e]));
    const shareOf = (e: Stored) => new Map(e.shares.map((s) => [s.account ? String(s.account) : "me", s.amount]));
    const hb = stored.get(houseboat)!;
    assert.deepEqual([hb.title, hb.cost, hb.importKey], ["Houseboat (mine)", 300_000, rows[0].key], "your entry keeps its detail and is marked imported");
    assert.deepEqual(Object.fromEntries(shareOf(hb)), { me: 100_000, [asha]: 100_000, [ravi]: 100_000 });
    for (const [id, cost] of [[dinnerA, 40_000], [dinnerB, 50_000]] as const) {
        const e = stored.get(id)!;
        assert.deepEqual([e.cost, e.importKey], [cost, rows[1].key]);
        const parts = [...shareOf(e).values()];
        assert.equal(parts.reduce((s, v) => s + v, 0), cost, "the split adds up to the paisa");
        for (const v of parts) assert.ok(Math.abs(v - cost / 3) <= 2, `${v} isn't a third of ${cost}`);
        assert.deepEqual([...shareOf(e).keys()].sort(), ["me", asha, ravi].sort());
    }
    assert.equal(stored.get(split.json.data._id)!.importKey, null, "an entry that was already split is left alone");

    const again = await me.send("POST", `/trips/${trip}/import/preview`, { csv, mapping: mapping() });
    const after = again.json.data.rows as Row[];
    assert.deepEqual(after.map((r) => r.status), ["alreadyIn", "alreadyIn", "pickAccount", "alreadyIn", "alreadyIn"]);
    assert.equal(again.json.data.myShare, 4_100, "only the row not yet in counts towards your share");

    const before = await counts();
    const resent = await me.send("POST", `/trips/${trip}/import/commit`, { csv, mapping: mapping(), decisions });
    assert.equal(resent.status, 200);
    assert.deepEqual([resent.json.data.added, resent.json.data.applied, resent.json.data.settled], [0, 0, 0]);
    assert.deepEqual(await counts(), before);

    // A newer export of the same group: only its new row is offered.
    const newer = csvOf(PEOPLE, [...ROWS, `${day(0)},Breakfast,Dining out,300.00,INR,-100.00,200.00,-100.00`]);
    const next = (await me.send("POST", `/trips/${trip}/import/preview`, { csv: newer, mapping: mapping() })).json.data.rows as Row[];
    assert.deepEqual(next.map((r) => r.status), ["alreadyIn", "alreadyIn", "pickAccount", "alreadyIn", "alreadyIn", "ready"]);
});
