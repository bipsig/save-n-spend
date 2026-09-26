import z from "zod";

export const createAccountSchema = z.object({
    name: z.string().min(1).trim(),
    type: z.enum(["bank", "credit_card", "cash", "wallet", "person", "investment"]),
    startingBalance: z.number().int(),
    icon: z.string().optional(),
    color: z.string().optional(),
    investmentKind: z.string().trim().min(1).max(40).optional(),
    // Investments only. `startingBalance` is then what was invested so far (the cost basis);
    // `currentValue` is what it's worth today, which can differ — a holding bought at ₹1L now
    // worth ₹90k. Omitted means worth exactly what went in.
    currentValue: z.number().int().min(0).optional(),
    investedSince: z.coerce.date().refine((d) => d.getTime() <= Date.now(), "The start date can't be in the future").optional(),
    investedHow: z.enum(["sip", "lump"]).optional()
}).strict();

export const updateAccountSchema = z.object({
    name: z.string().min(1).trim().optional(),
    type: z.enum(["bank", "credit_card", "cash", "wallet", "person", "investment"]).optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
    investmentKind: z.string().trim().min(1).max(40).optional()
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
// Correcting a holding's cost basis after the fact — how much has gone in, since when, and
// how. `invested` is the TOTAL invested; the server works out the opening amount from it.
// Its own schema, like the balance sync: it restates the gain, so it shouldn't ride on a rename.
export const investmentBasisSchema = z.object({
    invested: z.number().int().min(0).optional(),
    investedSince: z.coerce.date().refine((d) => d.getTime() <= Date.now(), "The start date can't be in the future").nullable().optional(),
    investedHow: z.enum(["sip", "lump"]).nullable().optional()
}).strict();

// Deleting a holding outright. `undo` reverses every money move into and out of it (they
// were mistakes); `keep` leaves the other accounts' balances exactly as they are (the money
// really moved — the holding is just being set up again).
export const deleteInvestmentQuerySchema = z.object({
    mode: z.enum(["undo", "keep"]),
});
