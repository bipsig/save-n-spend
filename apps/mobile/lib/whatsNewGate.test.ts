import { test } from "node:test";
import assert from "node:assert/strict";
import { alsoNewLine, showsSheet, smallerChangesLine } from "./whatsNewGate";
import type { SheetGate } from "./whatsNewGate";

// Run from apps/api: node --require ts-node/register --test ../mobile/lib/whatsNewGate.test.ts

const OPEN: SheetGate = { hasSheet: true, signedIn: true, locked: false, awake: true, inTour: false, onTabs: true };

test("showsSheet: shows only when every condition holds", () => {
  assert.equal(showsSheet(OPEN), true);
  assert.equal(showsSheet({ ...OPEN, hasSheet: false }), false);
  assert.equal(showsSheet({ ...OPEN, signedIn: false }), false);
  assert.equal(showsSheet({ ...OPEN, locked: true }), false);
  assert.equal(showsSheet({ ...OPEN, awake: false }), false);
  assert.equal(showsSheet({ ...OPEN, inTour: true }), false);
  assert.equal(showsSheet({ ...OPEN, onTabs: false }), false);
});

test("smallerChangesLine: counts what the highlights leave out", () => {
  assert.equal(smallerChangesLine(10, 3), "And 7 smaller changes");
  assert.equal(smallerChangesLine(4, 3), "And 1 smaller change");
  assert.equal(smallerChangesLine(3, 3), null);
  assert.equal(smallerChangesLine(2, 2), null);
});

test("alsoNewLine: short last-seen version, versions as given", () => {
  assert.equal(alsoNewLine("2.4.0", ["2.5.0"]), "Also new since 2.4: 2.5.0");
  assert.equal(alsoNewLine("2.3.1", ["2.5.0", "2.4.0"]), "Also new since 2.3.1: 2.5.0, 2.4.0");
});
