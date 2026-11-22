import { z } from "./z";
import { money, objectId } from "./fields";

import { ACCOUNT_TYPES, INVESTED_HOW } from "../constants";

// shortcut: no length cap (fields.ts's `name()` caps at 60), because people added from a
// Splitwise import carry full names and the edit sheet sends the name back on every save.
// Cap it once a check of stored names says nothing is longer.
const name = z.string().trim().min(1, "Name can't be empty");

/** A day the money started going in: anything `new Date()` reads (the app sends
 *  `toISOString()`), and not in the future. */
const pastDate = z.string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Start date isn't a valid date")
    .transform((v) => new Date(v))
    .refine((d) => d.getTime() <= Date.now(), "The start date can't be in the future");

const investmentKind = z.string().trim().min(1).max(40);

/** The fields only a holding has. On any other type they are refused rather than stored
 *  (`investmentKind`) or dropped without a word (the rest). */
const INVESTMENT_ONLY = ["investmentKind", "currentValue", "investedSince", "investedHow"] as const;
const INVESTMENT_LABELS: Record<(typeof INVESTMENT_ONLY)[number], string> = {
    investmentKind: "Investment type", currentValue: "Current value", investedSince: "Start date", investedHow: "How it was invested",
};

const createAccountSchema = z.object({
    name,
    type: z.enum(ACCOUNT_TYPES),
    startingBalance: money,
    icon: z.string().optional(),
    color: z.string().optional(),
    investmentKind: investmentKind.optional(),
    // Investments only. `startingBalance` is then what was invested so far (the cost basis);
    // `currentValue` is what it's worth today, which can differ — a holding bought at ₹1L now
    // worth ₹90k. Omitted means worth exactly what went in.
    currentValue: money.min(0).optional(),
    investedSince: pastDate.optional(),
    investedHow: z.enum(INVESTED_HOW).optional(),
}).strict().superRefine((body, ctx) => {
    if (body.type === "investment") return;
    for (const key of INVESTMENT_ONLY) {
        if (body[key] !== undefined) ctx.addIssue({ code: "custom", path: [key], message: `${INVESTMENT_LABELS[key]} is only for investments` });
    }
});

const updateAccountSchema = z.object({
    name: name.optional(),
    type: z.enum(ACCOUNT_TYPES).optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
    investmentKind: investmentKind.optional(),
}).strict();

// The user's list in the order they just left it in, front to back. Not a single
// `{ id, order }`: moving one row shifts everything after it, so a whole-list write is
// both fewer requests and the only version that can't end up with two rows claiming the
// same slot.
const reorderSchema = z.object({
    ids: z.array(objectId("An account in the list", "accounts")).min(1),
}).strict();

// Reconciling an account against what the bank actually says it holds.
//
// The field is the TARGET balance, not a delta, because that is the number the user reads off
// their banking app. Its own endpoint rather than part of `updateAccountSchema`: this is the one
// account write that moves money, and it should not hide inside a rename.
//
// Signed and unbounded: a credit card's balance is negative as it is used.
const syncAccountBalanceSchema = z.object({
    balance: money,
    note: z.string().trim().min(1).max(120).optional(),
}).strict();

// Correcting a holding's cost basis after the fact — how much has gone in, since when, and
// how. `invested` is the TOTAL invested; the server works out the opening amount from it.
// Its own schema, like the balance sync: it restates the gain, so it shouldn't ride on a rename.
const investmentBasisSchema = z.object({
    invested: money.min(0).optional(),
    investedSince: pastDate.nullable().optional(),
    investedHow: z.enum(INVESTED_HOW).nullable().optional(),
}).strict();

// Deleting a holding outright. `undo` reverses every money move into and out of it (they
// were mistakes); `keep` leaves the other accounts' balances exactly as they are (the money
// really moved — the holding is just being set up again).
const deleteInvestmentQuerySchema = z.object({
    mode: z.enum(["undo", "keep"]),
});

const accountParams = z.object({ id: objectId("Account") });
const holdingParams = z.object({ id: objectId("Holding") });

// What each route's validate() checks.
export const createAccountRequest = { body: createAccountSchema };
export const reorderAccountsRequest = { body: reorderSchema };
export const accountIdRequest = { params: accountParams };
export const updateAccountRequest = { params: accountParams, body: updateAccountSchema };
export const syncAccountBalanceRequest = { params: accountParams, body: syncAccountBalanceSchema };
export const holdingIdRequest = { params: holdingParams };
export const investmentBasisRequest = { params: holdingParams, body: investmentBasisSchema };
export const deleteInvestmentRequest = { params: holdingParams, query: deleteInvestmentQuerySchema };
