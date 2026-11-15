import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { validate } from "../middleware/validate";
import { toFailure } from "../middleware/errorHandler";
import { styleProblems } from "../utils/messages";
import {
    bulkConvertToInvestmentRequest, convertToInvestmentRequest, createTransactionRequest, listTransactionsRequest,
    transactionSummaryRequest, updateTransactionRequest,
} from "./transactionSchema";
import {
    createAccountRequest, deleteInvestmentRequest, investmentBasisRequest, reorderAccountsRequest, syncAccountBalanceRequest, updateAccountRequest,
} from "./accountSchema";

// Every body and query below is one the 2.6.0 app (commit 01efb7c) sends, read from its code:
// add-transaction.tsx, store/outbox.ts, lib/transactions.ts, lib/export.ts, lib/accounts.ts,
// lib/investments.ts, lib/recurring.ts, EditAccountSheet, TripSheet, AccountPickerSheet.

const A = "6aa0fcbd0bd274f50c193770";
const B = "6aa0fcbd0bd274f50c193771";
const C = "6aa0fcbd0bd274f50c193772";
const now = new Date().toISOString();

const run = (schemas: Parameters<typeof validate>[0], r: Partial<Request>, url = "/api/v1/transactions") => new Promise<{ status: number | null; code?: string; message?: string; valid?: unknown }>((resolve) => {
    const req = { params: {}, query: {}, body: undefined, originalUrl: url, ...r } as Request;
    validate(schemas)(req, {} as Response, (err?: unknown) => {
        if (!err) return resolve({ status: null, valid: req.valid });
        const f = toFailure(err, req);
        resolve({ status: f.status, code: f.code, message: f.message });
    });
});
const ok = async (schemas: Parameters<typeof validate>[0], r: Partial<Request>) => {
    const out = await run(schemas, r);
    assert.equal(out.status, null, `refused: ${out.message}`);
    return out.valid as { body?: unknown; query?: unknown };
};

test("POST /transactions accepts every body the 2.6.0 app sends", async () => {
    const extras = { note: "with Asha", location: "Kochi" };
    for (const body of [
        { type: "expense", amount: 25_000, account: A, category: B, title: "Groceries", occurredAt: now, clientId: "k1x9-abcdefgh" },
        { type: "expense", amount: 1_500, account: A, category: B, title: "Chai", occurredAt: now, clientId: "k1x9-abcdefgi", ...extras },
        { type: "income", amount: 300_000, account: A, category: B, title: "Salary", occurredAt: now, clientId: "k1x9-abcdefgj" },
        { type: "transfer", amount: 10_000, account: A, toAccount: B, occurredAt: now, clientId: "k1x9-abcdefgk", note: "ATM" },
        { type: "expense", amount: 30_000, account: A, category: B, title: "Dinner", occurredAt: now, owedBy: [{ account: C, amount: 30_000 }], clientId: "k1x9-abcdefgl" },
    ]) await ok(createTransactionRequest, { body });
});

test("PATCH /transactions/:id accepts both edit bodies the app sends", async () => {
    await ok(updateTransactionRequest, { params: { id: A }, body: { title: "Big shop", amount: 30_000, category: B, occurredAt: now, note: "edited" } });
    await ok(updateTransactionRequest, { params: { id: A }, body: { amount: 12_000, occurredAt: now } });
});

test("converts, account writes and investment writes accept what the app sends", async () => {
    await ok(convertToInvestmentRequest, { params: { id: A }, body: { toAccount: B } });
    await ok(bulkConvertToInvestmentRequest, { body: { transactionIds: [A, B], toAccount: C } });
    await ok(createAccountRequest, { body: { name: "Bank", type: "bank", startingBalance: 5_000_000, icon: "bank", color: "blue" } });
    await ok(createAccountRequest, { body: { name: "Asha", type: "person", startingBalance: 0 } });
    await ok(createAccountRequest, { body: { name: "Fund", type: "investment", startingBalance: 100_000, icon: "investments", color: "violet", investmentKind: "Mutual Fund", currentValue: 120_000, investedSince: now, investedHow: "sip" } });
    await ok(updateAccountRequest, { params: { id: A }, body: { name: "Bank 2", type: "bank", icon: "bank", color: "teal" } });
    await ok(updateAccountRequest, { params: { id: A }, body: { name: "Fund", type: "investment", icon: "investments", color: "violet", investmentKind: "SIP" } });
    await ok(syncAccountBalanceRequest, { params: { id: A }, body: { balance: -1_200_000 } });
    await ok(syncAccountBalanceRequest, { params: { id: A }, body: { balance: 1_100_000, note: "Matched to the bank app" } });
    await ok(reorderAccountsRequest, { body: { ids: [A, B, C] } });
    await ok(investmentBasisRequest, { params: { id: A }, body: { invested: 110_000 } });
    await ok(investmentBasisRequest, { params: { id: A }, body: { investedSince: now, investedHow: "sip" } });
    await ok(investmentBasisRequest, { params: { id: A }, body: { investedSince: null, investedHow: null } });
    await ok(deleteInvestmentRequest, { params: { id: A }, query: { mode: "keep" } });
});

test("list and summary queries the app sends parse, unknown parameters are dropped", async () => {
    const v = await ok(listTransactionsRequest, { query: { page: "1", limit: "20", startDate: "2026-11-01", endDate: "2026-11-15", category: `${A},${B}`, account: A, type: "expense", search: "guard", trips: "exclude", utm: "x" } });
    assert.deepEqual(v.query, { page: 1, limit: 20, startDate: "2026-11-01", endDate: "2026-11-15", category: `${A},${B}`, account: A, type: "expense", search: "guard", trips: "exclude" });
    await ok(listTransactionsRequest, { query: { trips: "exclude" } });
    await ok(transactionSummaryRequest, { query: { startDate: "2026-11-14", endDate: "2026-11-14" } });
});

test("bad input is a 400 with a sentence, never a 500 or a 409 (POST /transactions)", async () => {
    const cases: [Record<string, unknown> | undefined, string, string][] = [
        [{ type: "expense", amount: -5, account: A, category: B, title: "x" }, "invalid_input", "Amount must be more than zero"],
        [undefined, "invalid_input", "Type is required"],
        [{ type: "expense", amount: 5, account: A, category: B, title: "x", foo: 1 }, "invalid_input", "This request had something the server didn't expect. Please update the app"],
        [{ type: "expense", amount: 5, account: A, category: "abc", title: "x" }, "invalid_reference", "Category isn't one of your categories any more. Pick another"],
        [{ type: "transfer", amount: 5, account: A, toAccount: A }, "invalid_input", "Pick two different accounts"],
        [{ type: "expense", amount: 5, account: A, category: B, title: "x", occurredAt: "not a date" }, "invalid_input", "Date isn't a valid date"],
    ];
    for (const [body, code, message] of cases) {
        const out = await run(createTransactionRequest, { body });
        assert.deepEqual([out.status, out.code, out.message], [400, code, message]);
        assert.deepEqual(styleProblems(out.message!), []);
    }
});

test("a malformed path id is a 404 named after the thing", async () => {
    const out = await run(updateTransactionRequest, { params: { id: "abc" }, body: {} }, "/api/v1/transactions/abc");
    assert.deepEqual([out.status, out.message], [404, "That transaction doesn't exist any more"]);
    const h = await run(investmentBasisRequest, { params: { id: "abc" }, body: {} }, "/api/v1/investments/abc/basis");
    assert.deepEqual([h.status, h.message], [404, "That holding doesn't exist any more"]);
});

test("queries: one date alone, a huge limit and a bad id list are 400s", async () => {
    for (const [query, message] of [
        [{ startDate: "2026-11-01" }, "Pick both a start and an end date"],
        [{ limit: "500" }, "Limit is too big"],
        [{ page: "0" }, "Page must be more than zero"],
        [{ account: "abc" }, "An account in the filter isn't one of your accounts any more. Pick another"],
    ] as [Record<string, string>, string][]) {
        const out = await run(listTransactionsRequest, { query });
        assert.deepEqual([out.status, out.message], [400, message]);
    }
});

test("gaps row 194: investment-only fields are refused on any other account type", async () => {
    for (const extra of [{ investmentKind: "SIP" }, { currentValue: 5 }, { investedSince: now }, { investedHow: "sip" }]) {
        const out = await run(createAccountRequest, { body: { name: "Bank", type: "bank", startingBalance: 0, ...extra } }, "/api/v1/accounts");
        assert.equal(out.status, 400);
        assert.match(out.message!, /is only for investments$/);
    }
});

test("a start date in the future, or null on create, is refused (null no longer becomes 1970)", async () => {
    const future = new Date(Date.now() + 86_400_000 * 3).toISOString();
    assert.equal((await run(createAccountRequest, { body: { name: "F", type: "investment", startingBalance: 1, investedSince: future } })).message, "The start date can't be in the future");
    assert.equal((await run(createAccountRequest, { body: { name: "F", type: "investment", startingBalance: 1, investedSince: null } })).status, 400);
});
