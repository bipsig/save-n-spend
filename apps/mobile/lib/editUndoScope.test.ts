import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { editUndoAllowed } from "./undoCopy";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/editUndoScope.test.ts
//
// Which edits offer "Saved · Undo". The predicates decide the two mixed cases; the excluded
// screens are checked by reading their source, since they are components.

const ROOT = join(__dirname, "..");
const source = (path: string) => readFileSync(join(ROOT, path), "utf8");

test("a split expense or owed transfer gets no Undo; a plain one does", () => {
  assert.equal(editUndoAllowed.transaction({ splitGroupId: "g1" }), false);
  assert.equal(editUndoAllowed.transaction({ splitGroupId: null }), true);
  assert.equal(editUndoAllowed.transaction({}), true);
});

test("an account save that corrected the balance or re-based a holding gets no Undo", () => {
  assert.equal(editUndoAllowed.account({ correctedBalance: false, rebased: false }), true);
  assert.equal(editUndoAllowed.account({ correctedBalance: true, rebased: false }), false);
  assert.equal(editUndoAllowed.account({ correctedBalance: false, rebased: true }), false);
});

test("the edits with their own reverse, and settings, never offer Undo", () => {
  for (const path of [
    "app/settings.tsx",                          // preferences, notification switches
    "components/sheets/EditProfileSheet.tsx",
    "components/sheets/ChangePasswordSheet.tsx",
    "components/sheets/TimeZoneSheet.tsx",
    "app/trip-wrapup.tsx",                       // close trip (Reopen is its reverse)
    "components/sheets/RevalueSheet.tsx",        // a value update is a new adjustment row
    "app/manage-accounts.tsx",                   // archive / unarchive
    "app/manage-categories.tsx",
  ]) {
    assert.equal(source(path).includes("editWithUndo"), false, `${path} offers an edit Undo`);
  }
  // Match Splitwise's Save: its reverse is "Back to exact amounts".
  assert.equal(source("components/sheets/MatchSplitwiseSheet.tsx").includes("editWithUndo"), false);
});

test("the mixed cases go through their predicate", () => {
  assert.match(source("app/add-transaction.tsx"), /editUndoAllowed\.transaction\(/);
  assert.match(source("components/sheets/EditAccountSheet.tsx"), /editUndoAllowed\.account\(/);
});
