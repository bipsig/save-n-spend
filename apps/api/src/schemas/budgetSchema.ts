import z from "zod";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export const createBudgetSchema = z.object({
    category: z.string(),
    month: z.string().regex(monthPattern),
    limit: z.number().int().positive()
}).strict();

export const updateBudgetSchema = z.object({
    limit: z.number().int().positive()
}).strict();

export const listBudgetQuerySchema = z.object({
    month: z.string().regex(monthPattern).optional()
});
