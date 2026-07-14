import z from "zod/v4";

export const createTransactionSchema = z.object({
    type: z.enum(["expense", "income"]),
    amount: z.number().int().positive(),
    account: z.string(),
    category: z.string(),
    title: z.string().min(1),
    note: z.string().optional(),
    location: z.string().optional(),
    receiptUrl: z.string().optional(),
    paymentMode: z.enum(["cash", "upi", "card", "transfer"]).optional(),
    occurredAt: z.string().optional()
}).strict();

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