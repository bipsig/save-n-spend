import z from "zod";

export const createCategorySchema = z.object({
    name: z.string().min(1).trim(),
    kind: z.enum(["expense", "income"]),
    parent: z.string().optional(),
    icon: z.string().optional(),
    color: z.string().optional()
}).strict();

export const updateCategorySchema = z.object({
    name: z.string().min(1).trim().optional(),
    icon: z.string().optional(),
    color: z.string().optional()
}).strict();