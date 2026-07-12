import z from "zod";

export const createAccountSchema = z.object({
    name: z.string().min(1).trim(),
    type: z.enum(["bank", "credit_card", "cash", "wallet"]),
    startingBalance: z.number().int(),
    icon: z.string().optional(),
    color: z.string().optional()
}).strict();

export const updateAccountSchema = z.object({
    name: z.string().min(1).trim().optional(),
    type: z.enum(["bank", "credit_card", "cash", "wallet"]).optional(),
    icon: z.string().optional(),
    color: z.string().optional()
}).strict();