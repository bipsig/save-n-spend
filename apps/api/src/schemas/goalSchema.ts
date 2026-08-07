import z from "zod";

export const createGoalSchema = z.object({
    name: z.string().min(1).max(60),
    target: z.number().int().positive(),
    icon: z.string().optional(),
    color: z.string().optional(),
    deadline: z.coerce.date().optional()
}).strict();

export const updateGoalSchema = z.object({
    name: z.string().min(1).max(60).optional(),
    target: z.number().int().positive().optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
    deadline: z.coerce.date().nullable().optional()
}).strict();

export const contributeGoalSchema = z.object({
    amount: z.number().int().positive()
}).strict();
