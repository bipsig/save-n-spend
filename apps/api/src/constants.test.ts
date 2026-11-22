import { test } from "node:test";
import assert from "node:assert/strict";
import Account from "./models/Account";
import Transaction from "./models/Transaction";
import { ACCOUNT_TYPES, OWN_TYPES, PAYMENT_MODES, SPENDABLE_TYPES, TRANSACTION_TYPES } from "./constants";
import { OWN_TYPES as GROUP_OWN, SPENDABLE_TYPES as GROUP_SPENDABLE } from "./services/accountGroups";

test("models take their enums from constants.ts", () => {
    assert.deepEqual(Account.schema.path("type").options.enum, [...ACCOUNT_TYPES]);
    assert.deepEqual(Transaction.schema.path("type").options.enum, [...TRANSACTION_TYPES]);
    assert.deepEqual(Transaction.schema.path("paymentMode").options.enum, [...PAYMENT_MODES]);
});

test("the account-type groups are the constants, and every own type is a real type", () => {
    assert.deepEqual(GROUP_SPENDABLE, SPENDABLE_TYPES);
    assert.deepEqual(GROUP_OWN, OWN_TYPES);
    for (const t of OWN_TYPES) assert.ok((ACCOUNT_TYPES as readonly string[]).includes(t));
});
