import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import type { ITransaction } from "../models/Transaction";
import { changes, editedFields, getEffectOf, resplit, REDEEM_TOO_MUCH } from "./transactionService";
import { styleProblems } from "../utils/messages";

const id = () => new mongoose.Types.ObjectId();
const at = new Date("2026-11-01T10:00:00.000Z");
const row = (over: Partial<Record<keyof ITransaction, unknown>>) => ({
    type: "expense", amount: 10_000, account: id(), category: id(), title: "Dinner", occurredAt: at, ...over,
}) as unknown as ITransaction;

test("resplit: a new share scales every owed amount by the same factor (each person's proportion holds)", () => {
    const expense = row({ amount: 30_000 });
    // ₹300 mine, ₹300 and ₹150 owed: a ₹750 bill split 40/40/20.
    const sets = resplit(expense, { amount: 60_000 }, [{ amount: 30_000, note: "Dinner" }, { amount: 15_000, note: "Dinner" }] as ITransaction[]);
    assert.deepEqual(sets, [{ amount: 60_000 }, { amount: 30_000 }]);
    const total = 60_000 + 60_000 + 30_000;
    assert.deepEqual([60_000 / total, 30_000 / total], [0.4, 0.2]);
});

test("resplit: rounds to whole paise and never to zero", () => {
    const expense = row({ amount: 300 });
    assert.deepEqual(resplit(expense, { amount: 100 }, [{ amount: 100 }, { amount: 1 }] as ITransaction[]), [{ amount: 33 }, {}]);
});

test("resplit: the same share, account and moment change nothing (the app sends them back on every save)", () => {
    const expense = row({ amount: 30_000 });
    const sets = resplit(expense, { amount: 30_000, account: String(expense.account), occurredAt: new Date(at), title: "Dinner" }, [{ amount: 30_000, note: "Dinner" }] as ITransaction[]);
    assert.deepEqual(sets, [{}]);
});

test("resplit: a new account and moment move every transfer; a note that was the old title follows the new one", () => {
    const expense = row({ amount: 30_000 });
    const bank = String(id());
    const when = new Date("2026-11-02T10:00:00.000Z");
    const sets = resplit(expense, { account: bank, occurredAt: when, title: "Team dinner" }, [{ amount: 30_000, note: "Dinner" }, { amount: 5_000, note: "my own words" }] as ITransaction[]);
    assert.deepEqual(sets, [{ account: bank, occurredAt: when, note: "Team dinner" }, { account: bank, occurredAt: when }]);
});

test("editedFields: an edit is checked against the create rules for the row's type (gaps row 29)", () => {
    const cash = String(id());
    const transfer = row({ type: "transfer", account: new mongoose.Types.ObjectId(cash), toAccount: id(), category: null, title: null });
    assert.throws(() => editedFields(transfer, { toAccount: cash }), (e: { name: string; issues: { message: string }[] }) => e.name === "ZodError" && e.issues[0].message === "Pick two different accounts");
    assert.throws(() => editedFields(transfer, { category: String(id()) }), /ZodError|didn't expect/);
    assert.throws(() => editedFields(row({}), { toAccount: String(id()) }), /ZodError|didn't expect/);
});

test("editedFields: what the 2.6.0 edit screen sends passes and comes back as the $set", () => {
    const expense = row({});
    const occurredAt = "2026-11-03T08:00:00.000Z";
    const set = editedFields(expense, { title: "Groceries", amount: 25_000, category: String(expense.category), occurredAt, note: "edited" });
    assert.deepEqual(set, { title: "Groceries", amount: 25_000, category: String(expense.category), occurredAt: new Date(occurredAt), note: "edited" });
    const transfer = row({ type: "transfer", toAccount: id(), category: null, title: null });
    assert.deepEqual(editedFields(transfer, { amount: 12_000, occurredAt }), { amount: 12_000, occurredAt: new Date(occurredAt) });
});

test("editedFields: fields stored on a row of another shape don't block an edit of it", () => {
    // A transfer that kept a category from older data, and an expense that gained a toAccount (row 29's bug).
    assert.doesNotThrow(() => editedFields(row({ type: "transfer", toAccount: id() }), { amount: 5_000 }));
    assert.doesNotThrow(() => editedFields(row({ toAccount: id() }), { amount: 5_000 }));
    // A transfer a SIP bill paid stores a title; transfers take none, so it isn't sent.
    assert.doesNotThrow(() => editedFields(row({ type: "transfer", toAccount: id(), title: "SIP" }), { amount: 5_000 }));
});

test("changes compares ids and moments by value", () => {
    const r = row({});
    assert.equal(changes(r, { account: String(r.account).toUpperCase() }, "account"), false);
    assert.equal(changes(r, { account: String(id()) }, "account"), true);
    assert.equal(changes(r, { occurredAt: new Date(at) }, "occurredAt"), false);
    assert.equal(changes(r, {}, "category"), false);
});

test("a transfer's effect leaves one account and lands on the other", () => {
    const a = id(); const b = id();
    assert.deepEqual(getEffectOf(row({ type: "transfer", account: a, toAccount: b, amount: 700 })), [{ account: a, delta: -700 }, { account: b, delta: 700 }]);
});

test("the redemption message reads to the house style", () => {
    assert.deepEqual(styleProblems(REDEEM_TOO_MUCH), []);
});
