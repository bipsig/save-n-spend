import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSectionOrder } from "./accountOrder";

// Run from apps/mobile: npm test

const sections = [
  { label: "Accounts", ids: ["bank", "cash"] },
  { label: "Investments", ids: ["sip"] },
  { label: "People", ids: ["rahul", "priya"] },
];
const all = ["bank", "cash", "sip", "rahul", "priya", "neha", "rishabh"];

test("the dragged section's new order lands in place, the others keep theirs", () => {
  assert.deepEqual(
    mergeSectionOrder(sections, "Accounts", ["cash", "bank"], all),
    ["cash", "bank", "sip", "rahul", "priya", "neha", "rishabh"],
  );
});

test("hidden rows are still sent, after the ones on screen", () => {
  const out = mergeSectionOrder(sections, "People", ["priya", "rahul"], all);
  assert.deepEqual(out, ["bank", "cash", "sip", "priya", "rahul", "neha", "rishabh"]);
  // The whole live list, or the server collides the positions it isn't told about.
  assert.equal(out.length, all.length);
  assert.equal(new Set(out).size, all.length);
});

test("every account is sent exactly once, whichever section moved", () => {
  for (const s of sections) {
    const out = mergeSectionOrder(sections, s.label, [...s.ids].reverse(), all);
    assert.deepEqual([...out].sort(), [...all].sort());
  }
});

test("a section that isn't on screen leaves the order untouched", () => {
  assert.deepEqual(mergeSectionOrder(sections, "Nothing", ["x"], all), all);
});

test("nothing hidden, nothing appended", () => {
  const visible = ["bank", "cash"];
  assert.deepEqual(
    mergeSectionOrder([{ label: "Accounts", ids: visible }], "Accounts", ["cash", "bank"], visible),
    ["cash", "bank"],
  );
});

test("a row archived while the screen was open is left out, not ranked", () => {
  // `all` is the live list; the rendered sections still hold the archived row.
  const out = mergeSectionOrder(sections, "People", ["priya", "rahul"], ["bank", "sip", "rahul", "priya"]);
  assert.deepEqual(out, ["bank", "sip", "priya", "rahul"]);
  assert.ok(!out.includes("cash"));
});
