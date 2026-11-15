import { test } from "node:test";
import assert from "node:assert/strict";
import "./z";
import { styleProblems } from "../utils/messages";
import { labelFor, messageFor } from "./errorMap";
import { z as v3 } from "zod";
import * as v4 from "zod/v4";

// Stand-ins shaped like the schemas the API had at 207518b, one per zod version, so this test
// doesn't depend on files the area workers are rewriting.
const createTransactionSchema = v4.discriminatedUnion("type", [
    v4.object({ type: v4.literal("expense"), amount: v4.number().int().positive(), account: v4.string(), category: v4.string(), title: v4.string().min(1),
        owedBy: v4.array(v4.object({ account: v4.string(), amount: v4.number().int().positive() }).strict()).min(1).max(10).optional() }).strict(),
    v4.object({ type: v4.literal("transfer"), amount: v4.number().int().positive(), account: v4.string(), toAccount: v4.string() }).strict(),
]);
const updateTransactionSchema = v4.object({ amount: v4.number().int().positive().optional() }).strict();
const listTransactionQuerySchema = v4.object({
    startDate: v4.iso.date().optional(), endDate: v4.iso.date().optional(),
    page: v4.coerce.number().int().positive().default(1), limit: v4.coerce.number().int().positive().max(100).default(20),
});
const listNotificationQuerySchema = v4.object({ page: v4.coerce.number().int().positive().default(1) });
const dashboardSummaryQuerySchema = v4.object({ month: v4.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(), since: v4.iso.datetime().optional() });
const restoreRequestSchema = v4.object({ version: v4.literal(1), exportedAt: v4.iso.datetime(), accounts: v4.array(v4.looseObject({})), confirm: v4.literal(true) });
const createAccountSchema = v3.object({ name: v3.string().min(1).trim(), type: v3.enum(["bank", "cash", "person"]), startingBalance: v3.number().int() }).strict();
const syncAccountBalanceSchema = v3.object({ balance: v3.number().int() }).strict();
const updateMeSchema = v3.object({ name: v3.string().trim().min(2, "Name must be at least 2 characters").optional(),
    prefs: v3.object({ notifications: v3.object({ enabled: v3.boolean().optional(), billReminderLead: v3.union([v3.literal(1), v3.literal(3)]).optional() }).strict().optional() }).strict().optional() }).strict();
const registerSchema = v3.object({ name: v3.string().min(2), email: v3.string().email("Invalid Email"), password: v3.string().min(8) });
const createBillSchema = v3.object({ name: v3.string().min(1), amount: v3.number().int().positive(), dueDate: v3.coerce.date() }).strict();
const listBillQuerySchema = v3.object({ status: v3.enum(["pending", "paid"]).optional() });
const createGoalSchema = v3.object({ name: v3.string().min(1).max(60), target: v3.number().int().positive() }).strict();
const createBudgetSchema = v3.object({ category: v3.string(), month: v3.string().regex(/^\d{4}-\d{2}$/), limit: v3.number().int().positive() }).strict();
const tripExpenseSchema = v3.object({ title: v3.string().min(1), occurredAt: v3.coerce.date(), cost: v3.number().int().positive(), shares: v3.array(v3.object({ amount: v3.number().int().min(0) })).min(1) }).strict();
const settleSchema = v3.object({ amount: v3.number().int().positive(), direction: v3.enum(["received", "paid"]) }).strict();
const insightsQuerySchema = v3.object({ period: v3.enum(["day", "month"]).default("month"), offset: v3.coerce.number().int().max(0).default(0) });

type Parser = { safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } } };
const messages = (schema: Parser, input: unknown): string[] => {
    const r = schema.safeParse(input);
    assert.equal(r.success, false, `expected ${JSON.stringify(input)} to fail`);
    return r.error!.issues.map((i) => i.message);
};

// Bad input for schemas as they are today, v3 and v4. None of zod's own text may come out.
const CASES: [string, Parser, unknown][] = [
    ["transaction create (v4), empty", createTransactionSchema, {}],
    ["transaction create (v4), negative + unknown key", createTransactionSchema, { type: "expense", amount: -5, account: "a", category: "c", title: "t", foo: 1 }],
    ["transaction create (v4), bad type", createTransactionSchema, { type: "gift", amount: 5 }],
    ["transaction create (v4), split with a string amount", createTransactionSchema, { type: "expense", amount: 5, account: "a", category: "c", title: "t", owedBy: [{ account: "p", amount: "3" }] }],
    ["transaction create (v4), no body", createTransactionSchema, undefined],
    ["transaction update (v4)", updateTransactionSchema, { amount: 1.5 }],
    ["transaction list query (v4)", listTransactionQuerySchema, { limit: "500", page: "0", startDate: "2026-13-01" }],
    ["notifications query (v4)", listNotificationQuerySchema, { page: "0" }],
    ["dashboard query (v4)", dashboardSummaryQuerySchema, { month: "2026-13", since: "yesterday" }],
    ["restore (v4)", restoreRequestSchema, { confirm: true }],
    ["account create (v3)", createAccountSchema, { type: "gold", foo: 1 }],
    ["account balance (v3)", syncAccountBalanceSchema, { balance: "12" }],
    ["user update (v3)", updateMeSchema, { name: "", prefs: { notifications: { billReminderLead: 5, enabled: "yes" } } }],
    ["bill create (v3)", createBillSchema, { name: "", amount: 0, dueDate: "not a date" }],
    ["bill list query (v3)", listBillQuerySchema, { status: "overdue" }],
    ["goal create (v3)", createGoalSchema, {}],
    ["budget create (v3)", createBudgetSchema, { category: 5, month: "May", limit: 0 }],
    ["trip expense (v3)", tripExpenseSchema, { title: "x", occurredAt: "x", cost: 1, paidBy: "zz", shares: [] }],
    ["settle (v3)", settleSchema, { direction: "sideways" }],
    ["insights query (v3)", insightsQuerySchema, { period: "decade", offset: "1" }],
];

// zod's default wording, v3 and v4.
const ZOD_TEXT = /^Required$|^Invalid( input| option| enum value| literal| discriminator| date| ISO|$)|[Ee]xpected .*received|must contain (at least|at most)|^Number must be|^String must|Unrecognized key|^Too (small|big)/;

for (const [name, schema, input] of CASES) {
    test(`no library text: ${name}`, () => {
        for (const m of messages(schema, input)) {
            assert.doesNotMatch(m, ZOD_TEXT);
            assert.ok(!styleProblems(m).includes("has library or HTTP text"), m);
        }
    });
}

test("zod's own text is replaced with labelled sentences", () => {
    assert.deepEqual(messages(createAccountSchema, {}), ["Name is required", "Type is required", "Opening balance is required"]);
    assert.ok(messages(createAccountSchema, { name: "A", type: "gold", startingBalance: 0 }).includes("Type isn't one of the options"));
    assert.ok(messages(syncAccountBalanceSchema, { balance: "12" }).includes("Balance must be a number"));
    assert.ok(messages(createAccountSchema, { name: "A", type: "bank", startingBalance: 0, foo: 1 }).includes("This request had something the server didn't expect. Please update the app"));
    assert.deepEqual(messages(createTransactionSchema, undefined), ["Something was missing from the request. Please update the app"]);
    assert.deepEqual(messages(createTransactionSchema, {}), ["Type is required"]);
    assert.deepEqual(messages(createTransactionSchema, { type: "gift" }), ["Type isn't one of the options"]);
    assert.ok(messages(restoreRequestSchema, { confirm: true }).every((m) => m === "That doesn't look like a Save n Spend backup file"));
    assert.ok(messages(updateTransactionSchema, { amount: -1 }).includes("Amount must be more than zero"));
    assert.ok(messages(updateTransactionSchema, { amount: 1.5 }).includes("Amount must be a whole number"));
    assert.ok(messages(listTransactionQuerySchema, { limit: "500" }).includes("Limit is too big"));
    assert.ok(messages(listTransactionQuerySchema, { startDate: "2026-13-01", endDate: "2026-12-01" }).includes("Start date isn't a valid date"));
    assert.ok(messages(createTransactionSchema, { type: "expense", amount: 5, account: "a", category: "c", title: "t", owedBy: [{ account: "p", amount: "3" }] }).includes("What each person owes must be a number"));
    assert.ok(messages(insightsQuerySchema, { offset: "1" }).includes("That period hasn't finished yet"));
    assert.ok(messages(registerSchema, { name: "Sa", email: "x", password: "longenough" }).includes("Invalid Email"), "a message the schema wrote itself is kept");
});

test("labels never fall back to a field name", () => {
    assert.equal(labelFor(["owedBy", 2, "amount"]), "What each person owes");
    assert.equal(labelFor(["prefs", "timeZone"]), "Time zone");
    assert.equal(labelFor(["somethingNew"]), "Something in the request");
    assert.equal(messageFor({ code: "custom", path: ["mysteryField"] }), "Something in the request isn't valid");
});
