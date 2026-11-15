import { test } from "node:test";
import assert from "node:assert/strict";
import { INDEX_KEY, INDEX_NAME, INDEX_OPTIONS, PROD_DB, pickDb, sameIndex } from "./buildCategoryIndex";
import { CATEGORY_NAME_COLLATION } from "../src/controllers/categoryController";

test("dev by default; prod only with --prod-approved; anything else refused", () => {
    assert.equal(pickDb({}), "save-n-spend-dev");
    assert.throws(() => pickDb({ db: PROD_DB }), /prod-approved/);
    assert.equal(pickDb({ db: PROD_DB, prodApproved: true }), PROD_DB);
    assert.throws(() => pickDb({ db: "save-n-spend-test", prodApproved: true }), /unknown database/);
});

test("the index compares names the way the create and rename checks do", () => {
    assert.deepEqual(INDEX_OPTIONS.collation, CATEGORY_NAME_COLLATION);
    assert.deepEqual(INDEX_OPTIONS.partialFilterExpression, { isArchived: false });
});

test("an existing index counts as this one only when key, uniqueness, filter and collation all match", () => {
    const built = { v: 2, name: INDEX_NAME, key: INDEX_KEY, unique: true, partialFilterExpression: { isArchived: false }, collation: { locale: "en", strength: 2, caseLevel: false } };
    assert.equal(sameIndex(built), true);
    assert.equal(sameIndex({ ...built, unique: undefined }), false);
    assert.equal(sameIndex({ ...built, collation: { locale: "en", strength: 3 } }), false);
    assert.equal(sameIndex({ ...built, key: { userId: 1, name: 1 } }), false);
});
