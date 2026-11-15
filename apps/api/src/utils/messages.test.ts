import { test } from "node:test";
import assert from "node:assert/strict";
import { MESSAGES, conflict, duplicate, invalidReference, notFound, styleProblems } from "./messages";

test("helpers read as one plain sentence", () => {
    assert.equal(notFound("bill"), "That bill doesn't exist any more");
    assert.equal(invalidReference("The account it goes to", "accounts"), "The account it goes to isn't one of your accounts any more. Pick another");
    assert.equal(invalidReference("Category"), "Category isn't one of yours any more. Pick another");
    assert.equal(duplicate("a budget for this category this month"), "You already have a budget for this category this month");
    assert.equal(conflict("This trip is closed", "Reopen it to make changes"), "This trip is closed. Reopen it to make changes");
    assert.equal(conflict("This trip is already closed"), "This trip is already closed");
});

test("every fixed message and helper output follows the style rules", () => {
    const all = [
        ...Object.values(MESSAGES), notFound("holding"), invalidReference("A person in the split", "people"),
        duplicate("a category with this name"), conflict("This bill is already paid for this period"),
    ];
    for (const m of all) assert.deepEqual(styleProblems(m), [], m);
});

test("styleProblems catches what the rules forbid", () => {
    assert.ok(styleProblems("Invalid credentials!").includes('has "!"'));
    assert.ok(styleProblems("Something went wrong. Please try again.").includes("ends with a full stop"));
    assert.ok(styleProblems("This trip is closed — reopen it").includes('uses " — " between sentences'));
    assert.ok(styleProblems("Not one of your accounts: 6aa0fcbd0bd274f50c193770").includes("has an id"));
    assert.ok(styleProblems("You can only redeem up to ₹12,000").includes("has an amount"));
    assert.ok(styleProblems("Invalid _id").includes("has a field name"));
    assert.ok(styleProblems("Pick a toAccount").includes("has a field name"));
    assert.ok(styleProblems("Cast to ObjectId failed for value").includes("has library or HTTP text"));
    assert.ok(styleProblems("Unrecognized key(s) in object: 'foo'").includes("has library or HTTP text"));
    assert.ok(styleProblems("required").includes("doesn't start with a capital"));
});
