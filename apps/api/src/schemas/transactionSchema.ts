import z from "zod/v4";

const baseTransaction = z.object({
    amount: z.number().int().positive(),
    note: z.string().optional(),
    location: z.string().optional(),
    receiptUrl: z.string().optional(),
    paymentMode: z.enum(["cash", "upi", "card", "transfer"]).optional(),
    occurredAt: z.string().optional(),
});

const spendTransaction = baseTransaction.extend({
    type: z.enum(["expense", "income"]),
    account: z.string(),
    category: z.string(),
    title: z.string().min(1),
}).strict();

const transferTransaction = baseTransaction.extend({
    type: z.literal("transfer"),
    account: z.string(),
    toAccount: z.string()
}).strict();

export const createTransactionSchema = z.discriminatedUnion("type", [
    spendTransaction,
    transferTransaction
]);

export const listTransactionQuerySchema = z.object({
    startDate: z.iso.date().optional(),
    endDate: z.iso.date().optional(),
    category: z.string().optional(),
    type: z.enum(["expense", "income", "transfer"]).optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
}).refine((data) => (!!data.startDate === !!data.endDate), {
    message: "startDate and endDate must be provided together",
    path: ["endDate"]
});