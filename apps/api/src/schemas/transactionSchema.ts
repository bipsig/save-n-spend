import { z } from "./z";
import { calendarDay, limit, objectId, page, positiveMoney } from "./fields";
import { invalidReference } from "../utils/messages";

const OBJECT_ID = /^[a-f0-9]{24}$/i;

/** Anything `new Date()` reads, as before: the app sends `toISOString()`. Kept as text; the
 *  controller makes the Date. */
const moment = z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "Date isn't a valid date");

/** The list filters' comma-separated ids (the filter sheet multi-selects). Empty stays allowed. */
const idList = (label: string, things: string, extra?: string) => z.string().refine(
    (v) => v.split(",").filter(Boolean).every((id) => OBJECT_ID.test(id) || id === extra),
    { message: invalidReference(label, things), params: { code: "invalid_reference" } },
);

const account = objectId("Account", "accounts");
const toAccount = objectId("The account it goes to", "accounts");
const category = objectId("Category", "categories");
const paymentMode = z.enum(["cash", "upi", "card", "transfer"]);

const baseTransaction = z.object({
    amount: positiveMoney,
    note: z.string().optional(),
    location: z.string().optional(),
    receiptUrl: z.string().optional(),
    paymentMode: paymentMode.optional(),
    occurredAt: moment.optional(),
    // Set by Add Transaction on every send (the outbox replays the same one), so a replay after
    // a lost response finds the saved row instead of making a second. See Transaction.clientId.
    clientId: z.string().min(8).max(64).optional(),
});

const incomeTransaction = baseTransaction.extend({
    type: z.literal("income"),
    account,
    category,
    title: z.string().min(1),
}).strict();

const expenseTransaction = baseTransaction.extend({
    type: z.literal("expense"),
    account,
    category,
    title: z.string().min(1),
    // A split: `amount` above is the user's own share, and each row here becomes a
    // transfer from `account` into a person account for what that person owes. Capped
    // because each row is a write and a balance move — nobody splits dinner 11 ways here.
    owedBy: z.array(z.object({
        account: objectId("A person in the split", "people"),
        amount: positiveMoney,
    }).strict()).min(1).max(10).optional(),
}).strict();

const transferTransaction = baseTransaction.extend({
    type: z.literal("transfer"),
    account,
    toAccount,
}).strict().refine((t) => t.account.toLowerCase() !== t.toAccount.toLowerCase(), { message: "Pick two different accounts", path: ["toAccount"] });

const adjustmentTransaction = baseTransaction.extend({
    type: z.enum(["positiveAdjustment", "negativeAdjustment"]),
    account,
    title: z.string().min(1).optional(),
}).strict();

export const createTransactionSchema = z.discriminatedUnion("type", [
    expenseTransaction,
    incomeTransaction,
    transferTransaction,
    adjustmentTransaction,
]);
export type CreateTransactionBody = z.output<typeof createTransactionSchema>;

const idParams = z.object({ id: objectId("Transaction") });

// What the list and its summary both narrow by, so the card can never be asked about other rows.
const filterFields = {
    startDate: calendarDay.optional(),
    endDate: calendarDay.optional(),
    // `trips` is the built-in Trips category: with `trips=entries` it picks the closed trips.
    category: idList("A category in the filter", "categories", "trips").optional(),
    account: idList("An account in the filter", "accounts").optional(),
    type: z.enum(["expense", "income", "transfer"]).optional(),
    // Capped because the term becomes a `$regex` the database has to run against every
    // candidate title. Escaping (see `escapeRegex` in services/transactionFilter) removes the
    // pathological-backtracking risk; the cap removes the merely-expensive one. 80 is
    // far more than any transaction title is worth searching for.
    search: z.string().trim().max(80).optional(),
    // Trip rows live in their own view: "exclude" is the everyday list, "only" the trips one.
    // Unset means everything — what an export, a ledger, needs. "entries" (2.8.6) is everyday
    // rows plus one row per closed trip on its close day, and none of a trip's own rows.
    trips: z.enum(["exclude", "only", "entries"]).optional(),
};
const bothDates = { message: "Pick both a start and an end date", path: ["endDate"] };

const listTransactionQuerySchema = z.object({
    ...filterFields,
    page,
    limit: limit(100),
}).refine((data) => (!!data.startDate === !!data.endDate), bothDates);

const transactionSummaryQuerySchema = z.object(filterFields)
    .refine((data) => (!!data.startDate === !!data.endDate), bothDates);

// Converting an existing expense into an investment contribution. Its own endpoint rather
// than part of updateTransaction: this deliberately changes the type (expense → transfer),
// drops the category and sets the destination — invariants the general edit path doesn't touch.
const convertToInvestmentSchema = z.object({
    toAccount: objectId("The investment", "holdings"),
}).strict();

// The fields an edit may change. Not `type`, `clientId` or a split's `owedBy`: the edited row
// is then checked against the create rules for its type (see editedFields), so a transfer
// can't gain a category and an expense can't gain a `toAccount`.
const updateTransactionSchema = z.object({
    amount: positiveMoney.optional(),
    account: account.optional(),
    toAccount: toAccount.optional(),
    category: category.optional(),
    title: z.string().min(1).optional(),
    note: z.string().optional(),
    location: z.string().optional(),
    receiptUrl: z.string().optional(),
    paymentMode: paymentMode.optional(),
    occurredAt: moment.optional(),
}).strict();
export type TransactionPatch = z.output<typeof updateTransactionSchema>;

// "Move the past payments too" after setting up a SIP from a suggestion — the same
// reclassification as the single convert, over a batch, in one transaction.
const bulkConvertToInvestmentSchema = z.object({
    transactionIds: z.array(objectId("A payment in the list", "payments")).min(1).max(60),
    toAccount: objectId("The investment", "holdings"),
}).strict();

// What each route's validate() checks.
export const listTransactionsRequest = { query: listTransactionQuerySchema };
export const transactionSummaryRequest = { query: transactionSummaryQuerySchema };
export const createTransactionRequest = { body: createTransactionSchema };
export const transactionIdRequest = { params: idParams };
export const updateTransactionRequest = { params: idParams, body: updateTransactionSchema };
export const convertToInvestmentRequest = { params: idParams, body: convertToInvestmentSchema };
export const bulkConvertToInvestmentRequest = { body: bulkConvertToInvestmentSchema };
