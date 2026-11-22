import { test } from "node:test";
import assert from "node:assert/strict";
import { OWN_TYPES, SPENDABLE_TYPES, isSpendable, liquidBalance } from "./accountGroups";

test("spendable is bank, cash and wallet; own adds cards", () => {
    assert.deepEqual([...SPENDABLE_TYPES], ["bank", "cash", "wallet"]);
    assert.deepEqual([...OWN_TYPES], ["bank", "cash", "wallet", "credit_card"]);
    assert.deepEqual(["investment", "person", "credit_card"].map(isSpendable), [false, false, false]);
});

test("liquidBalance adds only the spendable accounts", () => {
    assert.equal(liquidBalance([
        { type: "bank", balance: 100 }, { type: "cash", balance: 20 }, { type: "wallet", balance: 3 },
        { type: "credit_card", balance: -500 }, { type: "investment", balance: 9_000 }, { type: "person", balance: 700 },
    ]), 123);
});
