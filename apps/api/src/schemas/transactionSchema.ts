import z from "zod/v4";

const baseTransaction = z.object({
    amount: z.number().int().positive(),
    note: z.string().optional(),
    location: z.string().optional(),
    receiptUrl: z.string().optional(),
    paymentMode: z.enum(["cash", "upi", "card", "transfer"]).optional(),
    occurredAt: z.string().optional(),
    // Set by an offline-queued create so a replay after a lost response is a no-op
    // rather than a duplicate — see Transaction.ts's partial-unique index on this field.
    clientId: z.string().min(8).max(64).optional(),
});

const incomeTransaction = baseTransaction.extend({
    type: z.literal("income"),
    account: z.string(),
    category: z.string(),
    title: z.string().min(1),
}).strict();

const expenseTransaction = baseTransaction.extend({
    type: z.literal("expense"),
    account: z.string(),
    category: z.string(),
    title: z.string().min(1),
    // A split: `amount` above is the user's own share, and each row here becomes a
    // transfer from `account` into a person account for what that person owes. Capped
    // because each row is a write and a balance move — nobody splits dinner 11 ways here.
    owedBy: z.array(z.object({
        account: z.string(),
        amount: z.number().int().positive(),
    }).strict()).min(1).max(10).optional(),
}).strict();

const transferTransaction = baseTransaction.extend({
    type: z.literal("transfer"),
    account: z.string(),
    toAccount: z.string()
}).strict();

const adjustmentTransaction = baseTransaction.extend({
    type: z.enum(["positiveAdjustment", "negativeAdjustment"]),
    account: z.string(),
    title: z.string().min(1).optional(),
}).strict();

export const createTransactionSchema = z.discriminatedUnion("type", [
    expenseTransaction,
    incomeTransaction,
    transferTransaction,
    adjustmentTransaction,
]);

export const listTransactionQuerySchema = z.object({
    startDate: z.iso.date().optional(),
    endDate: z.iso.date().optional(),
    category: z.string().optional(),
    account: z.string().optional(),
    type: z.enum(["expense", "income", "transfer"]).optional(),
    // Capped because the term becomes a `$regex` the database has to run against every
    // candidate title. Escaping (see `escapeRegex` in the controller) removes the
    // pathological-backtracking risk; the cap removes the merely-expensive one. 80 is
    // far more than any transaction title is worth searching for.
    search: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
}).refine((data) => (!!data.startDate === !!data.endDate), {
    message: "startDate and endDate must be provided together",
    path: ["endDate"]
});

export const transactionSummaryQuerySchema = z.object({
    startDate: z.iso.date().optional(),
    endDate: z.iso.date().optional(),
}).refine((data) => (!!data.startDate === !!data.endDate), {
    message: "startDate and endDate must be provided together",
    path: ["endDate"]
})

export const updateTransactionSchema = z.object({
    amount: z.number().int().positive().optional(),
    account: z.string().optional(),
    toAccount: z.string().optional(),
    category: z.string().optional(),
    title: z.string().min(1).optional(),
    note: z.string().optional(),
    location: z.string().optional(),
    receiptUrl: z.string().optional(),
    paymentMode: z.enum(["cash", "upi", "card", "transfer"]).optional(),
    occurredAt: z.string().optional(),
}).strict()