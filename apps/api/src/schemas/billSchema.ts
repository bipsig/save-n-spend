import z from "zod";

export const createBillSchema = z.object({
    name: z.string().min(1),
    amount: z.number().int().positive(),
    category: z.string().nullable().optional(),
    account: z.string().optional(),
    dueDate: z.coerce.date(),
    recurring: z.boolean().optional(),
    frequency: z.enum(["monthly", "yearly"]).optional(),
    reminderDays: z.number().int().min(0).optional(),
    toInvestment: z.string().nullable().optional()
}).strict();

export const updateBillSchema = z.object({
    name: z.string().min(1).optional(),
    amount: z.number().int().positive().optional(),
    category: z.string().nullable().optional(),
    account: z.string().optional(),
    dueDate: z.coerce.date().optional(),
    recurring: z.boolean().optional(),
    frequency: z.enum(["monthly", "yearly"]).optional(),
    reminderDays: z.number().int().min(0).optional(),
    toInvestment: z.string().nullable().optional()
}).strict();

export const listBillQuerySchema = z.object({
    status: z.enum(["pending", "paid"]).optional()
});

export const payBillSchema = z.object({
    account: z.string().optional()
});
