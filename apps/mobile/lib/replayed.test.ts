import { test } from "node:test";
import assert from "node:assert/strict";
import { recoverCreated, sameName } from "./replayed";
import { readSuccessBody } from "./apiError";

test("the replay reply itself reads as a success with no record", () => {
  assert.deepEqual(readSuccessBody(JSON.stringify({ message: "This was already saved", data: null })), { ok: true, data: null });
});

type Row = { _id: string; name: string; type: string };
const rows: Row[] = [
  { _id: "a1", name: "Rahul", type: "person" },
  { _id: "a2", name: "Cash", type: "cash" },
  { _id: "a3", name: "Priya", type: "person" },
  { _id: "a4", name: "priya ", type: "person" },
];
const named = (name: string) => (r: Row) => r.type === "person" && sameName(r.name, name);

test("a normal reply is used as it is", () => {
  const reply = { _id: "new", name: "Rahul", type: "person" };
  assert.equal(recoverCreated(reply, rows, named("Rahul")), reply);
});

test("a replay with data null finds the record in the refetched list", () => {
  assert.equal(recoverCreated(null, rows, named("rahul"))?._id, "a1");
  assert.equal(recoverCreated(undefined, rows, named("Rahul"))?._id, "a1");
});

test("no match, or two matches, recover nothing rather than guess", () => {
  assert.equal(recoverCreated(null, rows, named("Meera")), null);
  assert.equal(recoverCreated(null, rows, named("Priya")), null);
  assert.equal(recoverCreated(null, [], named("Rahul")), null);
});
