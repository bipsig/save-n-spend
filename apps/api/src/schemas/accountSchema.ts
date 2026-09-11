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

// The user's list in the order they just left it in, front to back. Not a single
// `{ id, order }`: moving one row shifts everything after it, so a whole-list write is
// both fewer requests and the only version that can't end up with two rows claiming the
// same slot.
export const reorderSchema = z.object({
    ids: z.array(z.string()).min(1)
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