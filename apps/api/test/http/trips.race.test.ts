/**
 * W3's route, race and replay tests for trips: every trip route the app calls, the agreed
 * status/code/message for each refusal, and each write sent twice and in parallel, as a fresh
 * user on the in-memory database (test/harness.ts). Balances are read from the database and
 * must add up to their rows afterwards.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import { useTestApi, type Reply, type Send } from "../harness";
import { effectsOf } from "../../scripts/invariants/rules";
import { styleProblems } from "../../src/utils/messages";

const api = useTestApi();
let send: Send;
let userId: ObjectId;
let cat: string;

before(async () => {
    await api.ready();
    const u = await api.user("w3-trips");
    send = u.send;
    userId = new ObjectId(u.id);
    cat = await u.category("expense");
});
const ro = { col: (name: Parameters<typeof api.ro.col>[0]) => api.ro.col(name) };

const par = <T>(n: number, fn: (i: number) => Promise<T>) => Promise.all(Array.from({ length: n }, (_, i) => fn(i)));
const codes = (rs: Reply[]) => rs.map((r) => r.status).sort();
const show = (label: string, r: Reply) => console.log(`# ${label}: ${r.status} ${r.json?.code ?? ""} ${r.json?.message ?? ""}`.trimEnd());
const acc = async (name: string, startingBalance = 1_000_000, type = "bank") => {
    const r = await send("POST", "/accounts", { name, type, startingBalance });
    assert.equal(r.status, 201, r.json?.message);
    return r.json.data._id as string;
};
const day = (offset: number) => { const d = new Date(Date.now() + offset * 86_400_000); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString(); };
const draft = (members: string[], name = "W3 trip") => ({ name, emoji: "🏖", color: "teal", startDate: day(-3), endDate: day(2), members, budget: null });
const trip = async (members: string[], name?: string) => {
    const r = await send("POST", "/trips", draft(members, name));
    assert.equal(r.status, 201, r.json?.message);
    return r.json.data._id as string;
};
/** You paid `cost` from `bank`, split evenly with `friends`. */
const youPaid = (bank: string, cost: number, friends: string[], title = "W3 dinner") => {
    const each = cost / (friends.length + 1);
    return { title, occurredAt: new Date().toISOString(), category: null, cost, paidBy: null, paidFrom: bank, shares: [{ account: null, amount: each }, ...friends.map((f) => ({ account: f, amount: each }))] };
};
const balance = async (id: string) => (await ro.col("accounts").find<{ balance: number }>({ _id: new ObjectId(id) }))[0].balance;
const count = (c: Parameters<typeof ro.col>[0], q: Record<string, unknown>) => ro.col(c).count({ userId, ...q });
const tripDoc = async (id: string) => (await ro.col("trips").find<{ status: string; members: ObjectId[] }>({ _id: new ObjectId(id) }))[0];
const drift = async (...ids: string[]) => {
    const oids = ids.map((i) => new ObjectId(i));
    const accounts = await ro.col("accounts").find<{ _id: ObjectId; balance: number; startingBalance?: number }>({ _id: { $in: oids } });
    const txns = await ro.col("transactions").find<Parameters<typeof effectsOf>[0]>({ $or: [{ account: { $in: oids } }, { toAccount: { $in: oids } }] });
    const sums = new Map<string, number>();
    for (const t of txns) for (const [a, d] of effectsOf(t)) sums.set(a, (sums.get(a) ?? 0) + d);
    return ids.map((id) => { const a = accounts.find((x) => String(x._id) === id)!; return a.balance - ((a.startingBalance ?? 0) + (sums.get(id) ?? 0)); });
};
const noDrift = async (...ids: string[]) => assert.deepEqual(await drift(...ids), ids.map(() => 0));
/** A refusal with the agreed status, code and sentence, and a message that follows the rules. */
const refused = (r: Reply, status: number, code: string, message?: string | RegExp, path?: string) => {
    assert.equal(r.status, status, `${r.status} ${r.json?.code} ${r.json?.message}`);
    assert.equal(r.json.code, code);
    if (typeof message === "string") assert.equal(r.json.message, message);
    else if (message) assert.match(r.json.message, message);
    assert.deepEqual(styleProblems(r.json.message), [], r.json.message);
    if (path !== undefined) assert.equal(r.json.issues?.[0]?.path, path);
};
const CLOSED = "This trip is closed. Reopen it to make changes";

test("every trip request the 2.6.0 app sends works, and create/update keep the stored shape minus internal fields", async () => {
    const bank = await acc("W3 bank"); const asha = await acc("W3 Asha", 0, "person"); const ravi = await acc("W3 Ravi", 0, "person");
    const created = await send("POST", "/trips", draft([asha, ravi]));
    assert.equal(created.status, 201);
    const t = created.json.data._id as string;
    for (const k of ["_id", "name", "emoji", "color", "startDate", "endDate", "members", "budget", "status", "closedAt", "createdAt", "updatedAt"]) assert.ok(k in created.json.data, k);
    assert.ok(!("userId" in created.json.data) && !("__v" in created.json.data));
    const edited = await send("PATCH", `/trips/${t}`, { ...draft([asha, ravi]), name: "W3 trip renamed", budget: 2_000_000 });
    assert.equal(edited.status, 200);
    assert.equal(edited.json.data.name, "W3 trip renamed");
    assert.ok(!("userId" in edited.json.data));

    const e1 = await send("POST", `/trips/${t}/expenses`, youPaid(bank, 90_000, [asha, ravi]));
    assert.equal(e1.status, 201);
    const e2 = await send("POST", `/trips/${t}/expenses`, { title: "W3 cab", occurredAt: new Date().toISOString(), category: cat, cost: 60_000, paidBy: asha, paidFrom: null, shares: [{ account: null, amount: 30_000 }, { account: asha, amount: 30_000 }] });
    assert.equal(e2.status, 201);
    const e2Id = e2.json.data._id as string;
    assert.equal((await send("PATCH", `/trips/${t}/expenses/${e2Id}`, { title: "W3 cab", occurredAt: new Date().toISOString(), category: cat, cost: 80_000, paidBy: asha, paidFrom: null, shares: [{ account: null, amount: 40_000 }, { account: asha, amount: 40_000 }] })).status, 200);
    const e3 = await send("POST", `/trips/${t}/expenses`, youPaid(bank, 600, [ravi], "W3 snack"));
    assert.equal((await send("DELETE", `/trips/${t}/expenses/${e3.json.data._id}`)).status, 200);
    assert.equal((await send("POST", `/trips/${t}/settle`, { person: asha, account: bank, amount: 10_000, direction: "received" })).status, 200);
    const detail = await send("GET", `/trips/${t}`);
    assert.equal(detail.status, 200);
    const entries = (detail.json.data.members as { account: string; balance: number }[]).filter((m) => m.balance !== 0).map((m) => ({ account: m.account, amount: m.balance }));
    assert.equal((await send("PUT", `/trips/${t}/plan`, { entries })).status, 200);
    assert.equal((await send("DELETE", `/trips/${t}/plan`)).status, 200);
    assert.equal((await send("POST", `/trips/${t}/close`, { letGo: [ravi] })).status, 200);
    assert.equal((await send("POST", `/trips/${t}/reopen`)).status, 200);
    assert.equal((await send("POST", `/trips/${t}/close`, { letGo: [] })).status, 200);
    assert.equal((await send("POST", `/trips/${t}/reopen`)).status, 200);
    assert.equal((await send("GET", "/trips")).status, 200);
    await noDrift(bank, asha, ravi);
    assert.equal((await send("DELETE", `/trips/${t}`)).status, 200);
    await noDrift(bank, asha, ravi);
    assert.deepEqual([await balance(bank), await balance(asha), await balance(ravi)], [1_000_000, 0, 0]);
});

test("refusals: ids in the URL are 404, body references 400 invalid_reference, state 409, rules 400", async () => {
    const bank = await acc("W3r bank"); const asha = await acc("W3r Asha", 0, "person"); const stranger = await acc("W3r stranger", 0, "person");
    const card = await acc("W3r fund", 0, "investment");
    const t = await trip([asha]);
    const missing = new ObjectId().toHexString();

    let r = await send("GET", "/trips/abc"); show("GET /trips/abc", r); refused(r, 404, "not_found", "That trip doesn't exist any more");
    r = await send("GET", `/trips/${missing}`); show("GET /trips/:missing", r); refused(r, 404, "not_found", "That trip doesn't exist any more");
    r = await send("POST", `/trips/abc/close`, { letGo: [] }); show("POST /trips/abc/close", r); refused(r, 404, "not_found", "That trip doesn't exist any more");
    r = await send("PATCH", `/trips/${t}/expenses/abc`, youPaid(bank, 2_000, [asha])); show("PATCH expense abc", r); refused(r, 404, "not_found", "That expense doesn't exist any more");
    r = await send("DELETE", `/trips/${t}/expenses/${missing}`); show("DELETE expense missing", r); refused(r, 404, "not_found", "That expense doesn't exist any more");

    r = await send("POST", "/trips", draft([asha, "nope"])); show("POST /trips malformed member", r); refused(r, 400, "invalid_reference", /isn't one of your people/, "members.1");
    r = await send("POST", "/trips", draft([asha, bank])); show("POST /trips bank as member", r); refused(r, 400, "invalid_reference", /isn't one of your people/, "members.1");
    r = await send("POST", "/trips", { ...draft([asha]), startDate: day(2), endDate: day(-2) }); show("POST /trips end before start", r); refused(r, 400, "invalid_input", "The trip can't end before it starts", "endDate");
    r = await send("POST", "/trips", { ...draft([asha]), foo: 1 }); show("POST /trips unknown key", r); refused(r, 400, "invalid_input");
    r = await send("POST", "/trips", {}); show("POST /trips {}", r); refused(r, 400, "invalid_input");

    r = await send("POST", `/trips/${t}/expenses`, youPaid(bank, 2_000, [stranger])); show("expense, share not on trip", r); refused(r, 400, "invalid_reference", /isn't one of your people on this trip/, "shares.1.account");
    r = await send("POST", `/trips/${t}/expenses`, { ...youPaid(bank, 2_000, [asha]), paidBy: stranger, paidFrom: null }); show("expense, payer not on trip", r); refused(r, 400, "invalid_reference", undefined, "paidBy");
    r = await send("POST", `/trips/${t}/expenses`, youPaid(card, 2_000, [asha])); show("expense, paid from a holding", r); refused(r, 400, "invalid_reference", /isn't one of your accounts/, "paidFrom");
    r = await send("POST", `/trips/${t}/expenses`, { ...youPaid(bank, 2_000, [asha]), category: missing }); show("expense, missing category", r); refused(r, 400, "invalid_reference", /isn't one of your categories/, "category");
    r = await send("POST", `/trips/${t}/expenses`, { ...youPaid(bank, 2_000, [asha]), cost: 3_000 }); show("expense, shares don't add up", r); refused(r, 400, "invalid_input", "The shares must add up to the amount", "shares");
    r = await send("POST", `/trips/${t}/expenses`, { ...youPaid(bank, 2_000, [asha]), paidFrom: null }); show("expense, no paid-from", r); refused(r, 400, "invalid_input", "Pick the account you paid from", "paidFrom");

    r = await send("POST", `/trips/${t}/settle`, { person: stranger, account: bank, amount: 1_000, direction: "received" }); show("settle, not on trip", r); refused(r, 400, "invalid_reference", undefined, "person");
    r = await send("POST", `/trips/${t}/settle`, { person: asha, account: asha, amount: 1_000, direction: "received" }); show("settle into a person", r); refused(r, 400, "invalid_reference", undefined, "account");
    r = await send("POST", `/trips/${t}/settle`, { person: asha, account: bank, amount: 1_000, direction: "received", clientId: `plan:${t}:${asha}` }); show("settle, server-style clientId", r); refused(r, 400, "invalid_input");
    r = await send("PUT", `/trips/${t}/plan`, { entries: [{ account: stranger, amount: 0 }] }); show("plan, not on trip", r); refused(r, 400, "invalid_reference", undefined, "entries.0.account");
    r = await send("PUT", `/trips/${t}/plan`, { entries: [{ account: asha, amount: 5 }] }); show("plan, wrong total", r); refused(r, 400, "invalid_input", undefined, "entries");
    r = await send("POST", `/trips/${t}/close`, { letGo: [stranger] }); show("close, letting go a stranger", r); refused(r, 400, "invalid_reference", undefined, "letGo.0");
    assert.equal((await tripDoc(t)).status, "active");

    assert.equal((await send("POST", `/trips/${t}/expenses`, youPaid(bank, 2_000, [asha]))).status, 201);
    r = await send("PATCH", `/trips/${t}`, { members: [] }); show("drop a member with expenses", r); refused(r, 409, "conflict", "Someone you're removing is already in this trip's expenses");

    assert.equal((await send("POST", `/trips/${t}/close`, { letGo: [] })).status, 200);
    r = await send("POST", `/trips/${t}/close`, { letGo: [] }); show("close twice", r); refused(r, 409, "conflict", "This trip is already closed");
    r = await send("POST", `/trips/${t}/expenses`, youPaid(bank, 2_000, [asha])); show("expense on a closed trip", r); refused(r, 409, "conflict", CLOSED);
    r = await send("POST", `/trips/${t}/import/preview`, { csv: "x" }); show("import preview on a closed trip", r); refused(r, 409, "conflict", CLOSED);
    assert.equal((await send("PATCH", `/trips/${t}`, { name: "Renamed while closed" })).status, 200);
    assert.equal((await send("POST", `/trips/${t}/reopen`)).status, 200);
    assert.equal((await send("POST", `/trips/${t}/reopen`)).status, 200);
    r = await send("POST", `/trips/${t}/import/preview`, { csv: "Name,Amount\nx,1" }); show("import preview, not Splitwise", r); refused(r, 400, "invalid_input", /doesn't look like a Splitwise export/, "csv");
    await noDrift(bank, asha);
});

test("T10: close letting a friend go, ×2 at once and once more → one let-go, friend at ₹0", async () => {
    const bank = await acc("T10 bank"); const asha = await acc("T10 Asha", 0, "person");
    const t = await trip([asha]);
    assert.equal((await send("POST", `/trips/${t}/expenses`, youPaid(bank, 400_000, [asha]))).status, 201);
    const r = await par(2, () => send("POST", `/trips/${t}/close`, { letGo: [asha] }));
    r.forEach((x, i) => show(`close #${i + 1}`, x));
    const again = await send("POST", `/trips/${t}/close`, { letGo: [asha] });
    assert.deepEqual(codes(r), [200, 409]);
    assert.equal(again.status, 409);
    assert.equal(await balance(asha), 0);
    assert.equal(await count("transactions", { tripId: new ObjectId(t), tripExpenseId: null, account: new ObjectId(asha) }), 1);
    await noDrift(bank, asha);
});

test("close with the same person listed twice lets them go once", async () => {
    const bank = await acc("dup bank"); const asha = await acc("dup Asha", 0, "person");
    const t = await trip([asha]);
    await send("POST", `/trips/${t}/expenses`, youPaid(bank, 2_000, [asha]));
    assert.equal((await send("POST", `/trips/${t}/close`, { letGo: [asha, asha] })).status, 200);
    assert.equal(await balance(asha), 0);
    await noDrift(bank, asha);
});

test("I4: expenses racing a close never land on the closed trip; whoever is let go ends at ₹0", async () => {
    for (let round = 0; round < 4; round += 1) {
        const bank = await acc(`I4 bank ${round}`); const asha = await acc(`I4 Asha ${round}`, 0, "person");
        const t = await trip([asha]);
        await send("POST", `/trips/${t}/expenses`, youPaid(bank, 2_000, [asha]));
        const r = await Promise.all([
            ...Array.from({ length: 4 }, () => send("POST", `/trips/${t}/expenses`, youPaid(bank, 2_000, [asha]))),
            send("POST", `/trips/${t}/close`, { letGo: [asha] }),
        ]);
        const added = r.slice(0, 4).filter((x) => x.status === 201).length;
        assert.ok(r.slice(0, 4).every((x) => x.status === 201 || x.status === 409), r.map((x) => x.status).join(","));
        assert.equal(r[4].status, 200);
        assert.equal(await count("tripexpenses", { tripId: new ObjectId(t) }), 1 + added);
        assert.equal(await balance(asha), 0, `round ${round}: Asha not at ₹0`);
        await noDrift(bank, asha);
    }
});

test("I3: removing a member while an expense with them lands never leaves a share on a non-member", async () => {
    for (let round = 0; round < 4; round += 1) {
        const bank = await acc(`I3 bank ${round}`); const asha = await acc(`I3 Asha ${round}`, 0, "person"); const ravi = await acc(`I3 Ravi ${round}`, 0, "person");
        const t = await trip([asha, ravi]);
        const r = await Promise.all([
            send("PATCH", `/trips/${t}`, { members: [asha] }),
            send("POST", `/trips/${t}/expenses`, youPaid(bank, 2_000, [ravi])),
        ]);
        const doc = await tripDoc(t);
        const members = new Set(doc.members.map(String));
        const shares = await ro.col("tripexpenses").find<{ shares: { account: ObjectId | null }[] }>({ tripId: new ObjectId(t) });
        for (const e of shares) for (const s of e.shares) if (s.account) assert.ok(members.has(String(s.account)), `round ${round}: ${r.map((x) => x.status)} left a share on a removed member`);
        await noDrift(bank, asha, ravi);
    }
});

test("T9b: settle-up with a clientId lands once, sent twice and ×3 at once", async () => {
    const bank = await acc("T9b bank"); const asha = await acc("T9b Asha", 0, "person");
    const t = await trip([asha]);
    const body = { person: asha, account: bank, amount: 50_000, direction: "received", clientId: `w3-${randomUUID()}` };
    const a = await send("POST", `/trips/${t}/settle`, body); show("settle #1", a);
    const b = await send("POST", `/trips/${t}/settle`, body); show("settle #2 (same clientId)", b);
    assert.deepEqual([a.status, b.status], [200, 200]);
    assert.equal(await count("transactions", { clientId: body.clientId }), 1);
    const body2 = { ...body, clientId: `w3-${randomUUID()}` };
    const r = await par(3, () => send("POST", `/trips/${t}/settle`, body2));
    assert.deepEqual(codes(r), [200, 200, 200]);
    assert.equal(await count("transactions", { clientId: body2.clientId }), 1);
    assert.equal(await balance(asha), -100_000);
    await noDrift(bank, asha);
});

test("I13: plan saved ×2 at once → one reroute row per person, balances add up", async () => {
    const bank = await acc("I13 bank"); const asha = await acc("I13 Asha", 0, "person"); const ravi = await acc("I13 Ravi", 0, "person");
    const t = await trip([asha, ravi]);
    await send("POST", `/trips/${t}/expenses`, youPaid(bank, 300_000, [asha, ravi]));
    const r = await par(2, () => send("PUT", `/trips/${t}/plan`, { entries: [{ account: asha, amount: 200_000 }] }));
    assert.deepEqual(codes(r), [200, 200]);
    const reroutes = await ro.col("transactions").find<{ account: ObjectId }>({ tripId: new ObjectId(t), clientId: { $regex: "^plan:" } });
    assert.equal(reroutes.length, 2);
    assert.equal(new Set(reroutes.map((x) => String(x.account))).size, 2);
    assert.deepEqual([await balance(asha), await balance(ravi)], [200_000, 0]);
    await noDrift(bank, asha, ravi);
});

const csvFor = (me: string, asha: string, newcomer: string) => [
    `Date,Description,Category,Cost,Currency,${me},${asha},${newcomer}`, "",
    `${day(-2).slice(0, 10)},W3 houseboat,General,3000.00,INR,2000.00,-1000.00,-1000.00`,
    `${day(-1).slice(0, 10)},W3 lunch,Dining out,900.00,INR,-300.00,600.00,-300.00`,
    `${day(-1).slice(0, 10)},Payment,Payment,500.00,INR,-500.00,500.00,0.00`, "",
    `${day(0).slice(0, 10)},Total balance, , ,INR,1200.00,-1100.00,-1300.00`,
].join("\n");

const decide = async (t: string, csv: string, mapping: Record<string, string>, bank: string) => {
    const pre = await send("POST", `/trips/${t}/import/preview`, { csv, mapping });
    assert.equal(pre.status, 200, pre.json?.message);
    return (pre.json.data.rows as { key: string; status: string; suggestedCategory: string | null }[]).map((r): Record<string, unknown> & { key: string; action: string } =>
        r.status === "skipped" || r.status === "alreadyIn" ? { key: r.key, action: "skip" }
            : r.status === "matchesYours" ? { key: r.key, action: "apply" }
                : { key: r.key, action: "import", category: r.suggestedCategory, account: bank });
};
const tripState = async (t: string) => ({
    expenses: await count("tripexpenses", { tripId: new ObjectId(t) }),
    rows: await count("transactions", { tripId: new ObjectId(t) }),
    people: await count("accounts", { type: "person" }),
    members: (await tripDoc(t)).members.length,
});

test("I14: an import commit sent again adds nothing and answers 200; sent ×2 at once it lands once", async () => {
    const bank = await acc("I14 bank"); const asha = await acc("I14 Asha", 0, "person");
    const csv = csvFor("W3 Me", "I14 Asha", "I14 Newcomer");
    const mapping = { "W3 Me": "me", "I14 Asha": asha, "I14 Newcomer": "new" };

    const t = await trip([asha], "I14 one");
    const decisions = await decide(t, csv, mapping, bank);
    const first = await send("POST", `/trips/${t}/import/commit`, { csv, mapping, decisions });
    show("commit #1", first);
    assert.equal(first.status, 200);
    assert.ok(first.json.data.added + first.json.data.settled > 0);
    const once = await tripState(t);
    const again = await send("POST", `/trips/${t}/import/commit`, { csv, mapping, decisions });
    show("commit #2 (same body)", again);
    assert.equal(again.status, 200);
    assert.deepEqual([again.json.data.added, again.json.data.applied, again.json.data.settled], [0, 0, 0]);
    assert.deepEqual(await tripState(t), once);
    // A fresh preview now shows every imported row as already in.
    const pre = await send("POST", `/trips/${t}/import/preview`, { csv, mapping: { ...mapping, "I14 Newcomer": "new" } });
    assert.ok((pre.json.data.rows as { status: string }[]).every((r) => r.status === "alreadyIn" || r.status === "skipped"));

    const t2 = await trip([asha], "I14 two");
    const decisions2 = await decide(t2, csv, mapping, bank);
    const r = await par(2, () => send("POST", `/trips/${t2}/import/commit`, { csv, mapping, decisions: decisions2 }));
    r.forEach((x, i) => show(`parallel commit #${i + 1}`, x));
    assert.deepEqual(codes(r), [200, 200]);
    const s2 = await tripState(t2);
    assert.deepEqual([s2.expenses, s2.rows, s2.members], [once.expenses, once.rows, once.members]);
    assert.equal(s2.people, once.people + 1, "the newcomer is created once");
    const people = (await ro.col("accounts").find<{ _id: ObjectId }>({ userId, type: "person" })).map((p) => String(p._id));
    await noDrift(bank, ...people);
});

test("an import commit that fails part-way writes nothing", async () => {
    const bank = await acc("atomic bank"); const asha = await acc("atomic Asha", 0, "person");
    const fund = await acc("atomic fund", 0, "investment");
    const csv = csvFor("W3 Me", "atomic Asha", "atomic Newcomer");
    const mapping = { "W3 Me": "me", "atomic Asha": asha, "atomic Newcomer": "new" };
    const t = await trip([asha], "atomic");
    const decisions = await decide(t, csv, mapping, bank);
    // The last chosen row points at a holding, which can't pay for a trip.
    const last = decisions.map((d) => d.action).lastIndexOf("import");
    decisions[last] = { ...decisions[last], account: fund };
    const before = await tripState(t);
    const r = await send("POST", `/trips/${t}/import/commit`, { csv, mapping, decisions });
    show("commit with a bad account on the last row", r);
    refused(r, 400, "invalid_reference", undefined, `decisions.${last}.account`);
    assert.deepEqual(await tripState(t), before);
    await noDrift(bank, asha);
});

/** A Splitwise file of `expenses` rows (you and five friends, the payer alternating) and
 *  `settles` payments from the first friend, every row distinct. */
const bigCsv = (expenses: number, settles: number) => {
    const people = ["Big Me", "Big P1", "Big P2", "Big P3", "Big P4", "Big P5"];
    const rows: string[] = [];
    for (let i = 0; i < expenses; i += 1) {
        const payer = i % 2 === 0 ? 0 : 1 + (i % 5);
        const effects = people.map((_, p) => (p === payer ? "500.00" : "-100.00"));
        rows.push(`${day(-1 - (i % 30)).slice(0, 10)},Big row ${i},General,600.00,INR,${effects.join(",")}`);
    }
    for (let j = 0; j < settles; j += 1) {
        rows.push(`${day(-1 - (j % 30)).slice(0, 10)},Big payment ${j},Payment,${(100 + j).toFixed(2)},INR,-${(100 + j).toFixed(2)},${(100 + j).toFixed(2)},0.00,0.00,0.00,0.00`);
    }
    return [`Date,Description,Category,Cost,Currency,${people.join(",")}`, "", ...rows].join("\n");
};

for (const [expenses, settles] of [[300, 20], [975, 25]] as const) {
    test(`F1: a ${expenses} + ${settles} row import commits in one transaction, fully, once`, { timeout: 600_000 }, async () => {
        const bank = await acc(`big bank ${expenses}`, 100_000_000); const p1 = await acc(`Big P1 ${expenses}`, 0, "person");
        const t = await trip([p1], `big ${expenses}`);
        const csv = bigCsv(expenses, settles);
        const mapping = { "Big Me": "me", "Big P1": p1, "Big P2": "new", "Big P3": "new", "Big P4": "new", "Big P5": "new" };
        const decisions = await decide(t, csv, mapping, bank);
        assert.equal(decisions.length, expenses + settles);
        const started = Date.now();
        const r = await send("POST", `/trips/${t}/import/commit`, { csv, mapping, decisions });
        const seconds = (Date.now() - started) / 1000;
        console.log(`# ${expenses} + ${settles} rows: ${r.status} in ${seconds.toFixed(1)} s ${JSON.stringify(r.json?.data ?? r.json?.message)}`);
        assert.equal(r.status, 200, r.json?.message);
        assert.deepEqual([r.json.data.added, r.json.data.settled], [expenses, settles]);
        const s = await tripState(t);
        assert.equal(s.expenses, expenses);
        assert.equal(s.members, 5);
        const again = await send("POST", `/trips/${t}/import/commit`, { csv, mapping, decisions });
        assert.equal(again.status, 200);
        assert.deepEqual([again.json.data.added, again.json.data.settled], [0, 0]);
        assert.deepEqual(await tripState(t), s);
        const people = (await ro.col("accounts").find<{ _id: ObjectId }>({ userId, type: "person" })).map((p) => String(p._id));
        await noDrift(bank, ...people);
    });
}
