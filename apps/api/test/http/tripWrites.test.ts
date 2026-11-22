import { before, test } from "node:test";
import assert from "node:assert/strict";
import { useTestApi, type TestUser } from "../harness";
import { failed } from "./readHelpers";

// What trip writes answer (gaps row 134) and what a closed trip still allows (row 190).

const api = useTestApi();
let me: TestUser;
let bank: string;
let friend: string;

const CLOSED = "This trip is closed. Reopen it to make changes";

before(async () => {
    await api.ready();
    me = await api.user("trip-writes");
    bank = await me.account("Bank", { startingBalance: 1_000_000 });
    friend = await me.account("Ravi", { type: "person", startingBalance: 0 });
});

test("create, update and close-date answer the list's trip shape plus updatedAt", async () => {
    const c = await me.send("POST", "/trips", { name: "Goa", startDate: "2026-03-20", endDate: "2026-03-22", members: [friend], budget: null });
    assert.equal(c.status, 201, c.text);
    const keys = ["_id", "budget", "closedAt", "closedOn", "color", "createdAt", "emoji", "endDate", "members", "name", "startDate", "status", "updatedAt"];
    assert.deepEqual(Object.keys(c.json.data).sort(), keys);
    assert.deepEqual([c.json.data.status, c.json.data.closedOn, c.json.data.members], ["active", null, [friend]]);
    const id = c.json.data._id as string;

    await me.send("PUT", `/trips/${id}/plan`, { entries: [] });
    const u = await me.send("PATCH", `/trips/${id}`, { name: "Goa 2026" });
    assert.equal(u.status, 200, u.text);
    assert.deepEqual(Object.keys(u.json.data).sort(), keys, "no plan, no stored-only fields");
    assert.equal(u.json.data.name, "Goa 2026");
    assert.ok(Date.parse(u.json.data.updatedAt) >= Date.parse(c.json.data.updatedAt));

    assert.equal((await me.send("POST", `/trips/${id}/close`, { letGo: [], closedOn: "2026-03-22" })).status, 200);
    const d = await me.send("PATCH", `/trips/${id}/close-date`, { closedOn: "2026-03-21" });
    assert.equal(d.status, 200, d.text);
    assert.deepEqual(Object.keys(d.json.data).sort(), keys);
    assert.deepEqual([d.json.data.status, d.json.data.closedOn], ["closed", "2026-03-21"]);
});

test("a closed trip refuses edits and delete until reopened; close date and settle still work", async () => {
    const c = await me.send("POST", "/trips", { name: "Ooty", startDate: "2026-04-10", endDate: "2026-04-11", members: [friend], budget: null });
    const id = c.json.data._id as string;
    const e = await me.send("POST", `/trips/${id}/expenses`, { title: "Boat", occurredAt: "2026-04-10T06:30:00Z", cost: 10_000, paidBy: null, paidFrom: bank, shares: [{ account: null, amount: 5_000 }, { account: friend, amount: 5_000 }] });
    assert.equal(e.status, 201, e.text);
    assert.equal((await me.send("POST", `/trips/${id}/close`, { letGo: [], closedOn: "2026-04-11" })).status, 200);

    failed(await me.send("PATCH", `/trips/${id}`, { name: "Ooty 2" }), 409, "conflict", CLOSED);
    failed(await me.send("DELETE", `/trips/${id}`), 409, "conflict", CLOSED);
    const after = (await me.send("GET", `/trips/${id}`)).json.data;
    assert.deepEqual([after.trip.name, after.trip.status, after.expenses.length], ["Ooty", "closed", 1], "nothing changed");

    assert.equal((await me.send("PATCH", `/trips/${id}/close-date`, { closedOn: "2026-04-10" })).status, 200);
    const s = await me.send("POST", `/trips/${id}/settle`, { person: friend, account: bank, amount: 5_000, direction: "received" });
    assert.equal(s.status, 200, s.text);

    assert.equal((await me.send("POST", `/trips/${id}/reopen`)).status, 200);
    assert.equal((await me.send("PATCH", `/trips/${id}`, { name: "Ooty 2" })).status, 200);
    assert.equal((await me.send("DELETE", `/trips/${id}`)).status, 200);
});
