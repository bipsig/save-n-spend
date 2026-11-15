import { z } from "./z";
import { objectId, positiveMoney } from "./fields";

/** Any text or number `new Date()` reads, as before; `null` and unreadable text are refused
 *  (`z.coerce.date()` turned `null` into 1 January 1970). */
const day = z.preprocess((v) => (typeof v === "string" || typeof v === "number" ? new Date(v) : v), z.date());

const frequency = z.enum(["monthly", "yearly"]);

/** The rule a bill must meet as a whole, after create or after an update is applied. */
export const billProblems = (bill: { recurring?: boolean | null; frequency?: string | null }): { path: string; message: string }[] =>
    bill.recurring && !bill.frequency ? [{ path: "frequency", message: "Pick how often this bill repeats" }] : [];

const fields = {
    // No maximum: bills never had one, and stored names may be longer than `name()` allows.
    name: z.string({ error: (i) => (i.input === undefined ? "Name is required" : "Name must be text") }).trim().min(1, "Name can't be empty"),
    amount: positiveMoney,
    category: objectId("Category", "categories").nullable().optional(),
    account: objectId("Account", "accounts").optional(),
    dueDate: day,
    recurring: z.boolean().optional(),
    frequency: frequency.optional(),
    reminderDays: z.number().int().min(0).optional(),
    toInvestment: objectId("Investment", "holdings").nullable().optional(),
};

const billId = z.object({ id: objectId("Bill") });

export const listBillsSchemas = {
    query: z.object({ status: z.enum(["pending", "overdue", "paid"]).optional() }),
};

export const createBillSchemas = {
    body: z.object(fields).strict().superRefine((bill, ctx) => {
        for (const p of billProblems(bill)) ctx.addIssue({ code: "custom", path: [p.path], message: p.message });
    }),
};

/** Each field as on create; the whole bill is checked with `billProblems` once applied. */
export const updateBillSchemas = {
    params: billId,
    body: z.object(fields).partial().strict(),
};

export const billIdSchemas = { params: billId };

/** The 2.6.0 app sends `{account}` or no body. */
export const payBillSchemas = {
    params: billId,
    body: z.object({ account: objectId("Account", "accounts").optional() }).strict(),
};

export const skipBillSchemas = { params: billId, body: z.object({}).strict() };
