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

// Reconciling an account against what the bank actually says it holds.
//
// The field is the TARGET balance, not a delta, because that is the number the user reads off
// their banking app. Its own endpoint rather than part of `updateAccountSchema`: this is the one
// account write that moves money, and it should not hide inside a rename.
//
// Signed and unbounded: a credit card's balance is negative as it is used.
export const syncAccountBalanceSchema = z.object({
    balance: z.number().int(),
    note: z.string().trim().min(1).max(120).optional()
}).strict();