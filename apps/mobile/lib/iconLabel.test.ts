import { test } from "node:test";
import assert from "node:assert/strict";
import { iconLabel } from "./iconLabel";

test("picker icons read as sentence-case words", () => {
  assert.equal(iconLabel("savings"), "Savings");
  assert.equal(iconLabel("childCare"), "Child care");
  assert.equal(iconLabel("fastfood"), "Fast food");
  assert.equal(iconLabel("tv"), "TV");
  assert.equal(iconLabel("atm"), "ATM");
  assert.equal(iconLabel("more"), "Other");
});
