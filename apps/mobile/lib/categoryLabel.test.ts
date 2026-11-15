import { test } from "node:test";
import assert from "node:assert/strict";
import type { ICategory } from "@save-n-spend/types";
import { labelFrom, liveOnly } from "./categoryLabel";

const cat = (c: Partial<ICategory> & { _id: string; name: string }): ICategory =>
  ({ userId: "u", parent: null, kind: "expense", isArchived: false, ...c });

const food = cat({ _id: "food", name: "Food & Dining" });
const groceries = cat({ _id: "groc", name: "Groceries", parent: "food" });
const oldSnacks = cat({ _id: "snack", name: "Snacks", parent: "food", isArchived: true });
const oldGym = cat({ _id: "gym", name: "Gym", isArchived: true });
const all = [food, groceries, oldSnacks, oldGym];
const live = liveOnly(all);

test("liveOnly keeps what pickers offer and drops archived", () => {
  assert.deepEqual(live.map((c) => c._id), ["food", "groc"]);
});

test("liveOnly keeps everything from an API that sends no isArchived", () => {
  const old = [{ ...food, isArchived: undefined }, { ...groceries, isArchived: undefined }] as unknown as ICategory[];
  assert.equal(liveOnly(old).length, 2);
});

test("an archived top-level category is named like a live one", () => {
  assert.deepEqual(labelFrom(all, live, "gym"), {
    name: "Gym", parentName: undefined, isChild: false, childCount: 0, path: "Gym", isArchived: true,
  });
});

test("an archived sub-category keeps its parent breadcrumb", () => {
  const label = labelFrom(all, live, "snack");
  assert.equal(label.name, "Snacks");
  assert.equal(label.path, "Food & Dining › Snacks");
  assert.equal(label.isChild, true);
  assert.equal(label.isArchived, true);
});

test("a live category is unchanged, and archived children don't count", () => {
  assert.deepEqual(labelFrom(all, live, "food"), {
    name: "Food & Dining", parentName: undefined, isChild: false, childCount: 1, path: "Food & Dining", isArchived: false,
  });
});

test("a missing or empty id is Uncategorised", () => {
  assert.equal(labelFrom(all, live, "gone").name, "Uncategorised");
  assert.equal(labelFrom(all, live, null).path, "Uncategorised");
  assert.equal(labelFrom(all, live, undefined).isArchived, false);
});
